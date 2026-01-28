'use strict'

/**
 * EventBridge Scheduler ターゲット
 *
 * 有料プランの期限切れ前後にユーザーへ Webhook 通知を送る。
 * Input: { userId, phase, expectedPaidUntil }
 *   phase: "7d" | "1d" | "expired"
 *   expectedPaidUntil: スケジュール登録時の paidUntil (ms)
 *                      — 再購入で延長されていた場合はスキップ
 */

const { DynamoDBClient }      = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb')
const { deliverNotification } = require('../shared/deliver')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const PHASE_CONFIG = {
  '7d': {
    title:   '有料プランの期限が近づいています',
    message: '有料プラン（DENTANプラン）の有効期限まで残り7日です。引き続きクラウド配信を利用するには期限内に更新してください。',
  },
  '1d': {
    title:   '有料プランの期限が明日に迫っています',
    message: '有料プラン（DENTANプラン）の有効期限まで残り1日です。期限切れ前に更新をお忘れなく。',
  },
  expired: {
    title:   '有料プランの有効期限が切れました',
    message: '有料プラン（DENTANプラン）の有効期限が切れました。クラウド配信を継続するには再度プランを購入してください。',
  },
}

exports.handler = async (event) => {
  const { userId, phase, expectedPaidUntil } = event

  if (!userId || !phase) {
    console.warn('[expiry-notify] missing userId or phase', event)
    return
  }

  const config = PHASE_CONFIG[phase]
  if (!config) {
    console.warn(`[expiry-notify] unknown phase: ${phase}`)
    return
  }

  const res = await dynamo.send(new GetCommand({
    TableName: process.env.ACCOUNTS_TABLE,
    Key: { userId },
  }))
  const account = res.Item
  if (!account) {
    console.warn(`[expiry-notify] account not found for userId=${userId}`)
    return
  }

  // 再購入などで paidUntil が変わっていたらスキップ（古いスケジュールが残っていた場合）
  if (expectedPaidUntil != null && account.paidUntil !== expectedPaidUntil) {
    console.info(`[expiry-notify] paidUntil mismatch, skipping ${phase} for userId=${userId}`)
    return
  }

  if (!account.webhookUrl || !account.webhookType) {
    console.info(`[expiry-notify] no webhook configured for userId=${userId}, skipping`)
    return
  }

  await deliverNotification(
    { type: account.webhookType, url: account.webhookUrl },
    { type: 'system', title: config.title, message: config.message },
  )

  console.info(`[expiry-notify] sent phase=${phase} notification for userId=${userId}`)
}
