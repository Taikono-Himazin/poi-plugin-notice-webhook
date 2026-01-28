'use strict'

/**
 * GET /billing/checkout
 *
 * PAY.JP v2 checkout session を作成し、ホスト型決済ページの URL を返す。
 * 1. アカウント取得/初期化
 * 2. POST /v2/checkout/sessions でセッションを作成
 * 3. セッション URL をプラグインに返す（プラグインはブラウザで開く）
 */

const { DynamoDBClient }       = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const ok  = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) })
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) })
const cors = () => ({ 'Access-Control-Allow-Origin': '*' })

// PAY.JP v2 REST API 呼び出し（Node 20 native fetch）
const payjpV2Post = async (path, body) => {
  const auth = Buffer.from(`${process.env.PAYJP_SECRET_KEY}:`).toString('base64')
  const res = await fetch(`https://api.pay.jp/v2/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || JSON.stringify(data)
    throw new Error(`PAY.JP v2 error: ${res.status} - ${msg}`)
  }
  return data
}

// プラン設定: クエリパラメータ plan=1m|6m|12m
const PLAN_CONFIG = {
  '1m':  { priceEnv: 'PAYJP_PRICE_1M',  months: 1  },
  '6m':  { priceEnv: 'PAYJP_PRICE_6M',  months: 6  },
  '12m': { priceEnv: 'PAYJP_PRICE_12M', months: 12 },
}

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub
  const email  = event.requestContext?.authorizer?.claims?.email
  if (!userId) return err(401, 'Unauthorized')

  const planKey    = event.queryStringParameters?.plan ?? '1m'
  const planConfig = PLAN_CONFIG[planKey] ?? PLAN_CONFIG['1m']
  const priceId    = process.env[planConfig.priceEnv]
  if (!priceId) return err(500, `Price ID not configured for plan: ${planKey}`)

  // アカウント取得・初期化
  const accountRes = await dynamo.send(new GetCommand({
    TableName: process.env.ACCOUNTS_TABLE,
    Key: { userId },
  }))

  if (!accountRes.Item) {
    await dynamo.send(new UpdateCommand({
      TableName: process.env.ACCOUNTS_TABLE,
      Key: { userId },
      UpdateExpression:
        'SET email = :email, #plan = :free, subscriptionStatus = :inactive, createdAt = :now',
      ExpressionAttributeNames: { '#plan': 'plan' },
      ExpressionAttributeValues: {
        ':email':    email ?? '',
        ':free':     'free',
        ':inactive': 'inactive',
        ':now':      Date.now(),
      },
    }))
  }

  // PAY.JP v2 checkout session 作成
  // POST /v2/checkout/sessions — Cognito メールアドレスを customer_email で渡してフォームを事前入力
  const apiUrl  = process.env.API_URL  // API Gateway URL（末尾 / あり）
  const sessionBody = {
    mode:        'payment',
    line_items:  [{ price_id: priceId, quantity: 1 }],
    success_url: `${apiUrl}billing/pay-complete`,
    cancel_url:  `${apiUrl}billing/pay-complete?canceled=1`,
    metadata:    { userId, planMonths: String(planConfig.months) },
  }
  if (email) sessionBody.customer_email = email
  const session = await payjpV2Post('checkout/sessions', sessionBody)

  return ok({
    checkoutUrl:      session.url,
    alreadySubscribed: false,
  })
}
