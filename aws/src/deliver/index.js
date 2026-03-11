'use strict'

const { DynamoDBClient }       = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb')
const { deliverNotification }  = require('../shared/deliver')
const { getAccount, isPaidActive } = require('../shared/subscription')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

exports.handler = async (event) => {
  const { notificationId } = event

  const res = await dynamo.send(new GetCommand({
    TableName: process.env.NOTIFICATIONS_TABLE,
    Key: { id: notificationId },
  }))
  if (!res.Item) return

  const { userId, tokenItem, payload } = res.Item

  // 遅延配信実行時に契約状態を再確認（スケジュール登録後に有効期限が切れていた場合はスキップ）
  if (userId) {
    const account = await getAccount(userId)
    if (!isPaidActive(account)) {
      console.warn(`[deliver] subscription expired for userId=${userId}, skipping notification ${notificationId}`)
      await dynamo.send(new DeleteCommand({
        TableName: process.env.NOTIFICATIONS_TABLE,
        Key: { id: notificationId },
      }))
      return
    }
  }

  await deliverNotification(tokenItem, payload)

  await dynamo.send(new DeleteCommand({
    TableName: process.env.NOTIFICATIONS_TABLE,
    Key: { id: notificationId },
  }))
}
