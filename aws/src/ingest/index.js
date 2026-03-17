'use strict'

const { DynamoDBClient }       = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb')
const { deliverNotification }  = require('../shared/deliver')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const ok  = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) })
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) })
const cors = () => ({ 'Access-Control-Allow-Origin': '*' })

exports.handler = async (event) => {
  // トークンからユーザーを特定（認証不要 — トークンが認証の役割を担う）
  const token = event.pathParameters?.token
  if (!token) return err(400, 'Token required')

  const tokenRes = await dynamo.send(new GetCommand({
    TableName: process.env.TOKENS_TABLE,
    Key: { token },
  }))
  if (!tokenRes.Item) return err(404, 'Invalid token')

  const userId = tokenRes.Item.userId

  const accountRes = await dynamo.send(new GetCommand({
    TableName: process.env.ACCOUNTS_TABLE,
    Key: { userId },
  }))
  const account = accountRes.Item
  if (!account) return err(404, 'Account not found. Please sign up first.')

  if (!account.webhookType) {
    return err(400, 'Webhook config not set. Please configure via PUT /account/config.')
  }

  // accountsTable の webhook 設定を配信ターゲットとして構築
  const deliveryTarget = {
    type:      account.webhookType,
    url:       account.webhookUrl || '',
    lineToken: account.webhookLineToken || '',
  }

  const body = JSON.parse(event.body || '{}')

  // 通知統計をアトミックにインクリメント（エラーは無視して配信を優先）
  const notifType  = body.type || 'other'
  const month      = new Date().toISOString().slice(0, 7) // "YYYY-MM"
  try {
    await dynamo.send(new UpdateCommand({
      TableName: process.env.STATS_TABLE,
      Key: { userId, month },
      UpdateExpression: 'ADD #total :one, #typeKey :one',
      ExpressionAttributeNames: {
        '#total':   'total',
        '#typeKey': `type_${notifType}`,
      },
      ExpressionAttributeValues: { ':one': 1 },
    }))
  } catch (e) {
    console.error('[ingest] stats update failed', e)
  }

  // 即時配信
  await deliverNotification(deliveryTarget, body)

  return ok({ ok: true })
}
