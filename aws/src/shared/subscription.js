'use strict'

const { DynamoDBClient }         = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

// 無料プランの月次制限
const FREE_MONTHLY_LIMIT = 30

/**
 * ユーザーアカウントを取得。存在しなければ null を返す。
 */
async function getAccount(userId) {
  const res = await dynamo.send(new GetCommand({
    TableName: process.env.ACCOUNTS_TABLE,
    Key: { userId },
  }))
  return res.Item ?? null
}

/**
 * 有料プランが有効かどうかを判定する。
 * v2 一回払い: paidUntil (ms) が現在時刻より未来であれば有効。
 * v1 サブスク : paidUntil がない場合は subscriptionStatus === 'active' で判定。
 */
function isPaidActive(account) {
  if (!account) return false
  if (account.paidUntil != null) return account.paidUntil > Date.now()
  return account.plan === 'paid' && account.subscriptionStatus === 'active'
}

/**
 * 月次カウンタをインクリメントし、無料プランの上限を超えていないか確認する。
 * @returns {{ allowed: boolean, count: number }}
 */
async function checkAndIncrementFreeQuota(userId) {
  const now      = Date.now()
  const thisMonth = new Date(now).toISOString().slice(0, 7) // "YYYY-MM"

  const res = await dynamo.send(new UpdateCommand({
    TableName: process.env.ACCOUNTS_TABLE,
    Key: { userId },
    // 月が変わっていたらカウンタをリセット
    UpdateExpression: `
      SET notificationCount = if_not_exists(notificationCount, :zero) + :one,
          notificationMonth = if_not_exists(notificationMonth, :month)
    `,
    ConditionExpression:
      'attribute_not_exists(notificationMonth) OR notificationMonth = :month',
    ExpressionAttributeValues: {
      ':zero':  0,
      ':one':   1,
      ':month': thisMonth,
    },
    ReturnValues: 'ALL_NEW',
  })).catch(async () => {
    // 月が変わっていた場合はリセットして再カウント
    return dynamo.send(new UpdateCommand({
      TableName: process.env.ACCOUNTS_TABLE,
      Key: { userId },
      UpdateExpression:
        'SET notificationCount = :one, notificationMonth = :month',
      ExpressionAttributeValues: {
        ':one':   1,
        ':month': thisMonth,
      },
      ReturnValues: 'ALL_NEW',
    }))
  })

  const count = res.Attributes?.notificationCount ?? 1
  return { allowed: count <= FREE_MONTHLY_LIMIT, count }
}

module.exports = { getAccount, isPaidActive, checkAndIncrementFreeQuota, FREE_MONTHLY_LIMIT }
