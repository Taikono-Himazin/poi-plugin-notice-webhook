'use strict'

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb')
const crypto = require('crypto')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const ok  = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) })
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) })
const cors = () => ({ 'Access-Control-Allow-Origin': '*' })

const VALID_SOURCES = new Set(['mobile-app', 'poi-plugin'])
const VALID_LEVELS  = new Set(['error', 'warn'])
const MAX_BODY_SIZE = 10 * 1024 // 10KB

exports.handler = async (event) => {
  const raw = event.body || ''
  if (raw.length > MAX_BODY_SIZE) return err(413, 'Payload too large')

  let body
  try { body = JSON.parse(raw) } catch (_) { return err(400, 'Invalid JSON') }

  const source = body.source
  const level  = body.level || 'error'
  if (!VALID_SOURCES.has(source)) return err(400, 'Invalid source')
  if (!VALID_LEVELS.has(level))   return err(400, 'Invalid level')
  if (!body.message || typeof body.message !== 'string') return err(400, 'Missing message')

  const now = new Date()
  const timestamp = now.toISOString()

  await dynamo.send(new PutCommand({
    TableName: process.env.ERRORS_TABLE,
    Item: {
      source,
      timestamp,
      id:      crypto.randomUUID(),
      level,
      message: body.message.slice(0, 1000),
      stack:   (body.stack || '').slice(0, 5000),
      context: body.context || {},
      ttl:     Math.floor(now.getTime() / 1000) + 365 * 86400,
    },
  }))

  return ok({ ok: true })
}
