'use strict'

const { DynamoDBClient }     = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const ok  = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) })
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) })
const cors = () => ({ 'Access-Control-Allow-Origin': '*' })

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub
  if (!userId) return err(401, 'Unauthorized')

  if (event.httpMethod === 'GET') {
    const res = await dynamo.send(new GetCommand({
      TableName: process.env.ACCOUNTS_TABLE,
      Key: { userId },
    }))
    const item = res.Item || {}
    return ok({
      webhookType:      item.webhookType      || '',
      webhookUrl:       item.webhookUrl       || '',
      webhookLineToken: item.webhookLineToken || '',
    })
  }

  const body = JSON.parse(event.body || '{}')
  const { webhookType, webhookUrl, lineToken } = body

  if (!webhookType || !['generic', 'discord', 'slack', 'line'].includes(webhookType)) {
    return err(400, 'Invalid webhookType')
  }
  if (webhookType !== 'line' && !webhookUrl) return err(400, 'webhookUrl is required')
  if (webhookType === 'line' && !lineToken) return err(400, 'lineToken is required for LINE')

  await dynamo.send(new UpdateCommand({
    TableName: process.env.ACCOUNTS_TABLE,
    Key: { userId },
    UpdateExpression: 'SET webhookType = :t, webhookUrl = :u, webhookLineToken = :lt',
    ExpressionAttributeValues: {
      ':t':  webhookType,
      ':u':  webhookUrl || '',
      ':lt': lineToken || '',
    },
  }))

  return ok({ ok: true })
}
