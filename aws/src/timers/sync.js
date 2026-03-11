'use strict'

const { DynamoDBClient }     = require('@aws-sdk/client-dynamodb')
const {
  DynamoDBDocumentClient,
  GetCommand, PutCommand, DeleteCommand, QueryCommand,
} = require('@aws-sdk/lib-dynamodb')
const { SchedulerClient, CreateScheduleCommand, DeleteScheduleCommand } = require('@aws-sdk/client-scheduler')
const crypto = require('crypto')

const dynamo    = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const scheduler = new SchedulerClient({})

const ok  = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) })
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) })
const cors = () => ({ 'Access-Control-Allow-Origin': '*' })

// EventBridge Scheduler で許可された文字のみに正規化
const safeScheduleName = (userId, type, slot) => {
  const hash = crypto.createHash('md5').update(userId).digest('hex').slice(0, 8)
  return `poi-timer-${hash}-${type}-${slot}`
}

const TYPE_TITLES = {
  expedition:   '遠征完了',
  repair:       '入渠完了',
  construction: '建造完了',
}

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub
  if (!userId) return err(401, 'Unauthorized')

  // アカウントの webhook 設定を取得
  const accountRes = await dynamo.send(new GetCommand({
    TableName: process.env.ACCOUNTS_TABLE,
    Key: { userId },
  }))
  if (accountRes.Item?.plan !== 'paid' || accountRes.Item?.subscriptionStatus !== 'active') {
    return err(403, 'Timer sync requires an active paid plan.')
  }
  if (!accountRes.Item?.webhookType) {
    return err(400, 'Webhook config not set. Please configure via PUT /account/config.')
  }

  const deliveryTarget = {
    type:      accountRes.Item.webhookType,
    url:       accountRes.Item.webhookUrl || '',
    lineToken: accountRes.Item.webhookLineToken || '',
  }

  const body    = JSON.parse(event.body || '{}')
  const timers  = Array.isArray(body.timers) ? body.timers : []
  const enabled = body.enabled ?? { expedition: true, repair: true, construction: true }

  // 既存タイマーを全削除（スケジュールキャンセル + DynamoDB 削除）
  const existingRes = await dynamo.send(new QueryCommand({
    TableName:                 process.env.TIMERS_TABLE,
    KeyConditionExpression:    'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }))

  await Promise.all((existingRes.Items || []).map(async (item) => {
    if (item.scheduleName) {
      await scheduler.send(new DeleteScheduleCommand({ Name: item.scheduleName })).catch(() => {})
    }
    if (item.notificationId) {
      await dynamo.send(new DeleteCommand({
        TableName: process.env.NOTIFICATIONS_TABLE,
        Key: { id: item.notificationId },
      })).catch(() => {})
    }
    await dynamo.send(new DeleteCommand({
      TableName: process.env.TIMERS_TABLE,
      Key: { userId, pk: item.pk },
    }))
  }))

  // 新しいタイマーを登録
  const now = Date.now()
  let scheduled = 0

  for (const timer of timers) {
    const { type, slot, completesAt, message } = timer
    if (!type || !slot || !completesAt) continue
    if (enabled[type] === false) continue

    const completesAtMs = new Date(completesAt).getTime()
    if (isNaN(completesAtMs) || completesAtMs <= now) continue

    const notificationId = crypto.randomUUID()
    const scheduleName   = safeScheduleName(userId, type, slot)
    const deliverAt      = new Date(completesAtMs - 60 * 1000)
    const pk             = `${type}#${slot}`
    const payload        = {
      message: message || `${TYPE_TITLES[type] ?? 'poi 通知'}`,
      type,
      title: TYPE_TITLES[type] ?? 'poi 通知',
    }

    // notifications テーブルに保存（deliver Lambda が参照する）
    await dynamo.send(new PutCommand({
      TableName: process.env.NOTIFICATIONS_TABLE,
      Item: {
        id:        notificationId,
        tokenItem: deliveryTarget,
        payload,
        ttl:       Math.floor(completesAtMs / 1000) + 86400,
      },
    }))

    // timers テーブルに状態を保存
    await dynamo.send(new PutCommand({
      TableName: process.env.TIMERS_TABLE,
      Item: {
        userId,
        pk,
        type,
        slot,
        completesAt,
        message:        payload.message,
        scheduleName,
        notificationId,
        ttl: Math.floor(completesAtMs / 1000) + 86400,
      },
    }))

    // EventBridge Scheduler を作成
    const scheduleExpr = deliverAt.toISOString().replace(/\.\d{3}Z$/, '')
    await scheduler.send(new CreateScheduleCommand({
      Name:                       scheduleName,
      ScheduleExpression:         `at(${scheduleExpr})`,
      ScheduleExpressionTimezone: 'UTC',
      FlexibleTimeWindow:         { Mode: 'OFF' },
      Target: {
        Arn:     process.env.DELIVER_FUNCTION_ARN,
        RoleArn: process.env.SCHEDULER_ROLE_ARN,
        Input:   JSON.stringify({ notificationId }),
      },
      ActionAfterCompletion: 'DELETE',
    }))

    scheduled++
  }

  return ok({ ok: true, scheduled })
}
