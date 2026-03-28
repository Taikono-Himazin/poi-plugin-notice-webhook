'use strict'

const { DynamoDBClient }     = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, DeleteCommand } = require('@aws-sdk/lib-dynamodb')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const ok  = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) })
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) })
const cors = () => ({ 'Access-Control-Allow-Origin': '*' })

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub
  if (!userId) return err(401, 'Unauthorized')

  const { pushToken } = JSON.parse(event.body || '{}')
  if (!pushToken || typeof pushToken !== 'string') {
    return err(400, 'pushToken is required')
  }

  await dynamo.send(new DeleteCommand({
    TableName: process.env.PUSH_TOKENS_TABLE,
    Key: { userId, pushToken },
  }))

  return ok({ ok: true })
}
