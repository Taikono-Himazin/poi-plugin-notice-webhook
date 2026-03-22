'use strict'

const { DynamoDBClient }     = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const ok  = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) })
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) })
const cors = () => ({ 'Access-Control-Allow-Origin': '*' })

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub
  if (!userId) return err(401, 'Unauthorized')

  const now = Date.now()

  const res = await dynamo.send(new QueryCommand({
    TableName:                 process.env.TIMERS_TABLE,
    KeyConditionExpression:    'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }))

  // 期限切れのタイマーを除外し、アプリに必要な項目のみ返す
  const timers = (res.Items || [])
    .filter(item => new Date(item.completesAt).getTime() > now)
    .map(item => ({
      type:        item.type,
      slot:        item.slot,
      completesAt: item.completesAt,
      message:     item.message,
      notifyBeforeMinutes: item.notifyBeforeMinutes ?? 1,
    }))

  return ok({ timers })
}
