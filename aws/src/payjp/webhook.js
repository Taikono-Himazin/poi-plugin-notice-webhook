'use strict'

/**
 * POST /payjp/webhook
 *
 * PAY.JP からのイベントを受け取り、サブスクリプション状態を DynamoDB に反映する。
 * 署名検証: Payjp-Signature ヘッダー (t=TIMESTAMP,v1=HMAC-SHA256)
 */

const crypto = require('crypto')
const Payjp  = require('payjp')
const { DynamoDBClient }       = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const ok  = () => ({ statusCode: 200, body: 'ok' })
const err = (code, msg) => ({ statusCode: code, body: msg })

// -----------------------------------------------------------------------------
// 署名検証
// Header 形式: "t=TIMESTAMP,v1=HMAC_SHA256_SIGNATURE"
// 署名対象   : "${timestamp}.${rawBody}"
// -----------------------------------------------------------------------------
function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((s) => s.split('=')),
  )
  const { t: timestamp, v1: signature } = parts
  if (!timestamp || !signature) return false

  // タイムスタンプ許容誤差: ±5分
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false

  const hmac     = crypto.createHmac('sha256', secret)
  const expected = hmac.update(`${timestamp}.${rawBody}`).digest('hex')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected,  'hex'),
    )
  } catch {
    return false
  }
}

// -----------------------------------------------------------------------------
// payjpCustomerId を使って DynamoDB の userId を逆引きする
// (accounts テーブルに payjpCustomerId-index GSI を追加することを推奨)
// -----------------------------------------------------------------------------
async function findUserByCustomerId(payjpCustomerId) {
  // PAY.JP customer の metadata.userId に userId を保存してあるため
  // payjp API で customer を取得して metadata から引く
  const payjp    = Payjp(process.env.PAYJP_SECRET_KEY)
  const customer = await payjp.customers.retrieve(payjpCustomerId)
  return customer?.metadata?.userId ?? null
}

// PAY.JP v2 REST API GET
const payjpV2Get = async (path) => {
  const auth = Buffer.from(`${process.env.PAYJP_SECRET_KEY}:`).toString('base64')
  const res = await fetch(`https://api.pay.jp/v2/${path}`, {
    headers: { Authorization: `Basic ${auth}` },
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || JSON.stringify(data)
    throw new Error(`PAY.JP v2 error: ${res.status} - ${msg}`)
  }
  return data
}

// N ヶ月後のタイムスタンプ（ms）を返す
function addMonths(timestamp, months) {
  const d = new Date(timestamp)
  d.setMonth(d.getMonth() + months)
  return d.getTime()
}

async function getAccount(userId) {
  const res = await dynamo.send(new GetCommand({
    TableName: process.env.ACCOUNTS_TABLE,
    Key: { userId },
  }))
  return res.Item ?? null
}

async function updateAccount(userId, attrs) {
  const names  = Object.fromEntries(Object.keys(attrs).map((k, i) => [`#k${i}`, k]))
  const values = Object.fromEntries(Object.keys(attrs).map((k, i) => [`:v${i}`, attrs[k]]))
  const expr   = Object.keys(attrs).map((_, i) => `#k${i} = :v${i}`).join(', ')

  await dynamo.send(new UpdateCommand({
    TableName: process.env.ACCOUNTS_TABLE,
    Key: { userId },
    UpdateExpression:          `SET ${expr}`,
    ExpressionAttributeNames:  names,
    ExpressionAttributeValues: values,
  }))
}

// -----------------------------------------------------------------------------
// ハンドラ
// -----------------------------------------------------------------------------
exports.handler = async (event) => {
  const rawBody    = event.body ?? ''
  const sigHeader  = event.headers?.['Payjp-Signature']
                  ?? event.headers?.['payjp-signature']
                  ?? ''
  const tokenHeader = event.headers?.['x-payjp-webhook-token']
                   ?? event.headers?.['X-Payjp-Webhook-Token']
                   ?? ''

  // v2 Checkout webhook: simple token 認証
  // v1 Subscription webhook: HMAC-SHA256 署名検証
  const secret = process.env.PAYJP_WEBHOOK_SECRET
  if (tokenHeader) {
    if (tokenHeader !== secret) {
      console.warn('[payjp/webhook] Invalid webhook token (v2)')
      return err(400, 'Invalid webhook token')
    }
  } else {
    if (!verifySignature(rawBody, sigHeader, secret)) {
      console.warn('[payjp/webhook] Signature verification failed (v1)')
      return err(400, 'Invalid signature')
    }
  }

  let payload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return err(400, 'Invalid JSON')
  }

  const eventType = payload.type // "checkout.session.completed" etc.
  // v1 形式: payload.data.object がリソースオブジェクト（object プロパティがオブジェクト）
  // v2 形式: payload.data 自体がリソースオブジェクト（object プロパティが型名文字列）
  const data = typeof payload.data?.object === 'object' && payload.data.object !== null
    ? payload.data.object
    : payload.data

  console.info('[payjp/webhook] event:', eventType, data?.id)

  try {
    switch (eventType) {

      // v2 Checkout: 決済完了
      // metadata フィールド名は PAY.JP v2 では meta_data（アンダースコア）
      case 'checkout.session.completed': {
        const meta       = data?.meta_data ?? data?.metadata
        const userId     = meta?.userId
        const planMonths = parseInt(meta?.planMonths ?? '1', 10)
        if (!userId) {
          console.warn('[payjp/webhook] checkout.session.completed: no userId in metadata')
          break
        }
        // 既存の有効期限が残っている場合はそこから延長、なければ現在時刻から計算
        const account        = await getAccount(userId)
        const now            = Date.now()
        const baseTs         = (account?.paidUntil ?? 0) > now ? account.paidUntil : now
        const paidUntil      = addMonths(baseTs, planMonths)
        await updateAccount(userId, {
          plan:               'paid',
          subscriptionStatus: 'active',
          paidUntil,
        })
        console.info(`[payjp/webhook] paidUntil set to ${new Date(paidUntil).toISOString()} for userId=${userId}`)
        break
      }

      case 'subscription.created': {
        const userId = await findUserByCustomerId(data.customer)
        if (!userId) break
        await updateAccount(userId, {
          plan:                 'paid',
          subscriptionStatus:   'active',
          payjpSubscriptionId:  data.id,
        })
        break
      }

      case 'subscription.updated': {
        // status: active / trial / canceled / paused
        const userId = await findUserByCustomerId(data.customer)
        if (!userId) break
        await updateAccount(userId, {
          subscriptionStatus: data.status,
          plan: data.status === 'active' ? 'paid' : 'free',
        })
        break
      }

      case 'subscription.deleted': {
        const userId = await findUserByCustomerId(data.customer)
        if (!userId) break
        await updateAccount(userId, {
          plan:               'free',
          subscriptionStatus: 'canceled',
        })
        break
      }

      case 'charge.failed': {
        // 課金失敗: past_due 扱いにする
        if (!data.customer) break
        const userId = await findUserByCustomerId(data.customer)
        if (!userId) break
        await updateAccount(userId, { subscriptionStatus: 'past_due' })
        break
      }

      default:
        // 未処理イベントは無視
        break
    }
  } catch (e) {
    console.error('[payjp/webhook] handler error:', e)
    return err(500, 'Internal error')
  }

  return ok()
}
