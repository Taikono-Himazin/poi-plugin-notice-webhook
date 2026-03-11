'use strict'

/**
 * POST /billing/subscribe
 * body: { cardToken: "tok_..." }
 *
 * PAY.JP でカスタマーとサブスクリプションを作成する。
 * フロントエンドで payjp.js によりカードをトークン化してから呼び出す。
 */

const Payjp = require('payjp')
const { DynamoDBClient }       = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const ok  = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) })
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) })
const cors = () => ({ 'Access-Control-Allow-Origin': '*' })

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub
  const email  = event.requestContext?.authorizer?.claims?.email
  if (!userId) return err(401, 'Unauthorized')

  const body = JSON.parse(event.body || '{}')
  const { cardToken } = body
  if (!cardToken) return err(400, 'cardToken is required')

  const payjp = Payjp(process.env.PAYJP_SECRET_KEY)

  // 既存アカウントを取得
  const accountRes = await dynamo.send(new GetCommand({
    TableName: process.env.ACCOUNTS_TABLE,
    Key: { userId },
  }))
  const account = accountRes.Item

  // すでにアクティブなサブスクがあればエラー
  if (account?.subscriptionStatus === 'active') {
    return err(409, 'Already subscribed')
  }

  let payjpCustomerId = account?.payjpCustomerId

  try {
    if (!payjpCustomerId) {
      // 新規カスタマー作成
      const customer = await payjp.customers.create({
        email:       email ?? '',
        card:        cardToken,
        description: `poi-webhook userId:${userId}`,
        metadata:    { userId },
      })
      payjpCustomerId = customer.id
    } else {
      // 既存カスタマーのカードを更新
      await payjp.customers.update(payjpCustomerId, { card: cardToken })
    }

    // サブスクリプション作成
    const subscription = await payjp.subscriptions.create({
      customer: payjpCustomerId,
      plan:     process.env.PAYJP_PLAN_ID,
    })

    // DynamoDB を更新
    await dynamo.send(new UpdateCommand({
      TableName: process.env.ACCOUNTS_TABLE,
      Key: { userId },
      UpdateExpression:
        'SET payjpCustomerId = :cid, payjpSubscriptionId = :sid, #plan = :paid, subscriptionStatus = :active',
      ExpressionAttributeNames: { '#plan': 'plan' },
      ExpressionAttributeValues: {
        ':cid':    payjpCustomerId,
        ':sid':    subscription.id,
        ':paid':   'paid',
        ':active': 'active',
      },
    }))

    return ok({
      subscriptionId: subscription.id,
      status:         subscription.status,
    })
  } catch (e) {
    console.error('[billing/subscribe] PAY.JP error:', e)
    return err(402, e.message ?? 'Payment failed')
  }
}
