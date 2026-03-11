'use strict'

const { DynamoDBClient }       = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const ok  = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) })
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) })
const cors = () => ({ 'Access-Control-Allow-Origin': '*' })

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub
  if (!userId) return err(401, 'Unauthorized')

  const token = event.pathParameters?.token
  if (!token) return err(400, 'Missing token')

  // 自分のトークンかどうか確認
  const res = await dynamo.send(new GetCommand({
    TableName: process.env.TOKENS_TABLE,
    Key: { token },
  }))
  if (!res.Item)              return err(404, 'Token not found')
  if (res.Item.userId !== userId) return err(403, 'Forbidden')

  await dynamo.send(new DeleteCommand({
    TableName: process.env.TOKENS_TABLE,
    Key: { token },
  }))

  return ok({ ok: true })
}
