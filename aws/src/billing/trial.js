'use strict'

/**
 * POST /billing/trial
 *
 * 初回限定 30 日無料トライアルを付与する。
 * - trialUsed === true のアカウントには 409 を返す。
 * - paidUntil を 30 日後に設定し、plan = 'paid', subscriptionStatus = 'active' にする。
 */

const { DynamoDBClient }       = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb')
const { isPaidActive } = require('../shared/subscription')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const ok  = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) })
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) })
const cors = () => ({ 'Access-Control-Allow-Origin': '*' })

const TRIAL_DAYS = 30

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub
  if (!userId) return err(401, 'Unauthorized')

  // 既存アカウントを取得
  const accountRes = await dynamo.send(new GetCommand({
    TableName: process.env.ACCOUNTS_TABLE,
    Key: { userId },
  }))
  const account = accountRes.Item

  // 既にトライアル使用済み
  if (account?.trialUsed) return err(409, 'Trial already used')

  // 既に有料プランがアクティブ（paidUntil の期限切れも考慮）
  if (isPaidActive(account)) {
    return err(409, 'Already subscribed')
  }

  const paidUntil = Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000

  await dynamo.send(new UpdateCommand({
    TableName: process.env.ACCOUNTS_TABLE,
    Key: { userId },
    UpdateExpression:
      'SET #plan = :paid, subscriptionStatus = :active, paidUntil = :paidUntil, trialUsed = :true',
    ExpressionAttributeNames: { '#plan': 'plan' },
    ExpressionAttributeValues: {
      ':paid':     'paid',
      ':active':   'active',
      ':paidUntil': paidUntil,
      ':true':     true,
    },
  }))

  return ok({
    plan:               'paid',
    subscriptionStatus: 'active',
    paidUntil,
    trialUsed:          true,
    notificationCount:  account?.notificationCount ?? 0,
  })
}
