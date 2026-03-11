'use strict'

const { DynamoDBClient }       = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb')
const { SchedulerClient, CreateScheduleCommand } = require('@aws-sdk/client-scheduler')
const { deliverNotification }  = require('../shared/deliver')
const { getAccount, isPaidActive, checkAndIncrementFreeQuota } = require('../shared/subscription')
const crypto = require('crypto')

const dynamo    = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const scheduler = new SchedulerClient({})

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

  const account = await getAccount(userId)
  if (!account) return err(404, 'Account not found. Please sign up first.')

  if (!account.webhookType) {
    return err(400, 'Webhook config not set. Please configure via PUT /account/config.')
  }

  const paid = isPaidActive(account)

  // 無料プラン：月次クォータチェック
  if (!paid) {
    const { allowed, count } = await checkAndIncrementFreeQuota(userId)
    if (!allowed) {
      return err(429, `Free plan limit reached (${count} notifications this month). Please upgrade.`)
    }
  }

  // accountsTable の webhook 設定を配信ターゲットとして構築
  const deliveryTarget = {
    type:      account.webhookType,
    url:       account.webhookUrl || '',
    lineToken: account.webhookLineToken || '',
  }

  const body         = JSON.parse(event.body || '{}')
  const delayMinutes = paid ? (Number(body.deliverAfterMinutes) || 0) : 0

  if (delayMinutes <= 0) {
    // 即時配信
    await deliverNotification(deliveryTarget, body)
  } else {
    // 遅延配信: DynamoDB に保存 + EventBridge Scheduler 登録
    const notificationId = crypto.randomUUID()
    const deliverAt      = new Date(Date.now() + delayMinutes * 60 * 1000)

    await dynamo.send(new PutCommand({
      TableName: process.env.NOTIFICATIONS_TABLE,
      Item: {
        id:        notificationId,
        userId,
        tokenItem: deliveryTarget,
        payload:   body,
        ttl:       Math.floor(deliverAt.getTime() / 1000) + 86400,
      },
    }))

    await scheduler.send(new CreateScheduleCommand({
      Name: `poi-notify-${notificationId}`,
      ScheduleExpression: `at(${deliverAt.toISOString().replace(/\.\d{3}Z$/, '')})`,
      ScheduleExpressionTimezone: 'UTC',
      FlexibleTimeWindow: { Mode: 'OFF' },
      Target: {
        Arn:    process.env.DELIVER_FUNCTION_ARN,
        RoleArn: process.env.SCHEDULER_ROLE_ARN,
        Input:  JSON.stringify({ notificationId }),
      },
      ActionAfterCompletion: 'DELETE',
    }))
  }

  return ok({ ok: true })
}
