'use strict'

const { DynamoDBClient }       = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb')
const { getAccount, isPaidActive } = require('../shared/subscription')
const crypto = require('crypto')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const ok  = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) })
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) })
const cors = () => ({ 'Access-Control-Allow-Origin': '*' })

// プランごとのトークン上限
const TOKEN_LIMITS = { free: 1, paid: 10 }

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub
  if (!userId) return err(401, 'Unauthorized')

    const account = await getAccount(userId)
  const paid    = isPaidActive(account)
  const limit   = paid ? TOKEN_LIMITS.paid : TOKEN_LIMITS.free

  // 既存トークン数を確認
  const existing = await dynamo.send(new QueryCommand({
    TableName: process.env.TOKENS_TABLE,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    Select: 'COUNT',
  }))
  if ((existing.Count ?? 0) >= limit) {
    return err(403, `Token limit reached (${limit} for ${paid ? 'paid' : 'free'} plan)`)
  }

  const token = crypto.randomUUID()
  await dynamo.send(new PutCommand({
    TableName: process.env.TOKENS_TABLE,
    Item: {
      token,
      userId,
      createdAt: Date.now(),
    },
  }))

  const apiUrl = `https://${event.requestContext.domainName}/${event.requestContext.stage}`
  return ok({ token, webhookUrl: `${apiUrl}/webhooks/${token}` })
}
