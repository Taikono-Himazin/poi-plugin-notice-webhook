'use strict'

/**
 * DELETE /billing/subscription
 *
 * PAY.JP のサブスクリプションをキャンセルする。
 * 月末まで有効で、次回更新日に完全停止される。
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
  if (!userId) return err(401, 'Unauthorized')

  const accountRes = await dynamo.send(new GetCommand({
    TableName: process.env.ACCOUNTS_TABLE,
    Key: { userId },
  }))
  const account = accountRes.Item

  // v2 一回払い: subscription ID なし → paidUntil をクリアして即時停止
  if (!account?.payjpSubscriptionId) {
    if (!account?.paidUntil || account.paidUntil <= Date.now()) {
      return err(400, 'No active plan')
    }
    await dynamo.send(new UpdateCommand({
      TableName: process.env.ACCOUNTS_TABLE,
      Key: { userId },
      UpdateExpression: 'SET #plan = :free, subscriptionStatus = :canceled, paidUntil = :now',
      ExpressionAttributeNames:  { '#plan': 'plan' },
      ExpressionAttributeValues: {
        ':free':     'free',
        ':canceled': 'canceled',
        ':now':      Date.now(),
      },
    }))
    return ok({ status: 'canceled' })
  }

  if (account.subscriptionStatus === 'canceled') {
    return err(409, 'Already canceled')
  }

  const payjp = Payjp(process.env.PAYJP_SECRET_KEY)

  try {
    // PAY.JP v1: cancel は次回更新日に停止（即時停止は delete）
    const subscription = await payjp.subscriptions.cancel(account.payjpSubscriptionId)

    await dynamo.send(new UpdateCommand({
      TableName: process.env.ACCOUNTS_TABLE,
      Key: { userId },
      UpdateExpression: 'SET subscriptionStatus = :status',
      ExpressionAttributeValues: { ':status': subscription.status },  // "canceled"
    }))

    return ok({
      subscriptionId: subscription.id,
      status:         subscription.status,
    })
  } catch (e) {
    console.error('[billing/cancel] PAY.JP error:', e)
    return err(500, e.message ?? 'Cancel failed')
  }
}
