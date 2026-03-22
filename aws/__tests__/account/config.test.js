'use strict'

const { mockClient } = require('aws-sdk-client-mock')
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb')

const ddbMock = mockClient(DynamoDBDocumentClient)

beforeEach(() => {
  ddbMock.reset()
  process.env.ACCOUNTS_TABLE = 'accounts'
})

const { handler } = require('../../src/account/config')

const makeEvent = (userId, method, body) => ({
  requestContext: { authorizer: { claims: { sub: userId } } },
  httpMethod: method,
  body: body ? JSON.stringify(body) : null,
})

describe('GET /account/config', () => {
  test('未認証なら 401', async () => {
    const res = await handler({ requestContext: {}, httpMethod: 'GET' })
    expect(res.statusCode).toBe(401)
  })

  test('設定を取得できる', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { userId: 'user-1', webhookType: 'discord', webhookUrl: 'https://discord.com/xxx' },
    })

    const res = await handler(makeEvent('user-1', 'GET'))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.webhookType).toBe('discord')
    expect(body.webhookUrl).toBe('https://discord.com/xxx')
  })

  test('アカウントが無い場合は空文字を返す', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined })

    const res = await handler(makeEvent('user-1', 'GET'))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.webhookType).toBe('')
    expect(body.webhookUrl).toBe('')
  })
})

describe('PUT /account/config', () => {
  test('無効な webhookType は 400', async () => {
    const res = await handler(makeEvent('user-1', 'PUT', {
      webhookType: 'invalid',
      webhookUrl: 'https://example.com',
    }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('Invalid webhookType')
  })

  test('webhookUrl が無い場合は 400', async () => {
    const res = await handler(makeEvent('user-1', 'PUT', {
      webhookType: 'discord',
    }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('webhookUrl')
  })

  test('webhookType が未指定なら 400', async () => {
    const res = await handler(makeEvent('user-1', 'PUT', {
      webhookUrl: 'https://example.com',
    }))
    expect(res.statusCode).toBe(400)
  })

  test('discord タイプで正常に保存できる', async () => {
    ddbMock.on(UpdateCommand).resolves({})

    const res = await handler(makeEvent('user-1', 'PUT', {
      webhookType: 'discord',
      webhookUrl: 'https://discord.com/api/webhooks/123/abc',
    }))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).ok).toBe(true)

    const updateCalls = ddbMock.commandCalls(UpdateCommand)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].args[0].input.ExpressionAttributeValues[':t']).toBe('discord')
  })

  test('slack タイプで正常に保存できる', async () => {
    ddbMock.on(UpdateCommand).resolves({})

    const res = await handler(makeEvent('user-1', 'PUT', {
      webhookType: 'slack',
      webhookUrl: 'https://hooks.slack.com/services/T/B/X',
    }))
    expect(res.statusCode).toBe(200)
  })
})
