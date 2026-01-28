'use strict'

const { DynamoDBClient }         = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

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

module.exports = { getAccount, isPaidActive }
