'use strict'

const { mockClient } = require('aws-sdk-client-mock')
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb')

const ddbMock = mockClient(DynamoDBDocumentClient)

jest.mock('../../src/shared/deliver', () => ({
  deliverNotification: jest.fn().mockResolvedValue(undefined),
}))

const { deliverNotification } = require('../../src/shared/deliver')

beforeEach(() => {
  ddbMock.reset()
  deliverNotification.mockClear()
  process.env.TOKENS_TABLE = 'tokens'
  process.env.ACCOUNTS_TABLE = 'accounts'
  process.env.STATS_TABLE = 'stats'
})

const { handler } = require('../../src/ingest/index')

const makeEvent = (token, body = {}) => ({
  pathParameters: { token },
  body: JSON.stringify(body),
})

describe('POST /webhooks/:token (ingest)', () => {
  test('token が無い場合は 400', async () => {
    const res = await handler({ pathParameters: {}, body: '{}' })
    expect(res.statusCode).toBe(400)
  })

  test('無効なトークンは 404', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined })

    const res = await handler(makeEvent('invalid-token'))
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error).toContain('Invalid token')
  })

  test('アカウントが存在しない場合は 404', async () => {
    ddbMock
      .on(GetCommand, { TableName: 'tokens' }).resolves({ Item: { token: 'tok-1', userId: 'user-1' } })
      .on(GetCommand, { TableName: 'accounts' }).resolves({ Item: undefined })

    const res = await handler(makeEvent('tok-1'))
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error).toContain('Account not found')
  })

  test('webhook 設定が無い場合は 400', async () => {
    ddbMock
      .on(GetCommand, { TableName: 'tokens' }).resolves({ Item: { token: 'tok-1', userId: 'user-1' } })
      .on(GetCommand, { TableName: 'accounts' }).resolves({ Item: { userId: 'user-1' } })

    const res = await handler(makeEvent('tok-1'))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('Webhook config not set')
  })

  test('正常に通知を配信する', async () => {
    ddbMock
      .on(GetCommand, { TableName: 'tokens' }).resolves({ Item: { token: 'tok-1', userId: 'user-1' } })
      .on(GetCommand, { TableName: 'accounts' }).resolves({
        Item: { userId: 'user-1', webhookType: 'discord', webhookUrl: 'https://discord.com/api/webhooks/123/abc' },
      })
      .on(UpdateCommand).resolves({})

    const payload = { message: '遠征完了', type: 'expedition' }
    const res = await handler(makeEvent('tok-1', payload))

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).ok).toBe(true)

    expect(deliverNotification).toHaveBeenCalledWith(
      { type: 'discord', url: 'https://discord.com/api/webhooks/123/abc', lineToken: '' },
      payload,
    )
  })

  test('統計がインクリメントされる', async () => {
    ddbMock
      .on(GetCommand, { TableName: 'tokens' }).resolves({ Item: { token: 'tok-1', userId: 'user-1' } })
      .on(GetCommand, { TableName: 'accounts' }).resolves({
        Item: { userId: 'user-1', webhookType: 'discord', webhookUrl: 'https://example.com' },
      })
      .on(UpdateCommand).resolves({})

    await handler(makeEvent('tok-1', { message: 'test', type: 'repair' }))

    const updateCalls = ddbMock.commandCalls(UpdateCommand)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].args[0].input.TableName).toBe('stats')
    expect(updateCalls[0].args[0].input.Key.userId).toBe('user-1')
  })

  test('統計更新が失敗しても配信は成功する', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    ddbMock
      .on(GetCommand, { TableName: 'tokens' }).resolves({ Item: { token: 'tok-1', userId: 'user-1' } })
      .on(GetCommand, { TableName: 'accounts' }).resolves({
        Item: { userId: 'user-1', webhookType: 'slack', webhookUrl: 'https://hooks.slack.com/xxx' },
      })
      .on(UpdateCommand).rejects(new Error('DynamoDB error'))

    const res = await handler(makeEvent('tok-1', { message: 'test' }))
    expect(res.statusCode).toBe(200)
    expect(deliverNotification).toHaveBeenCalled()
    expect(spy).toHaveBeenCalledWith('[ingest] stats update failed', expect.any(Error))

    spy.mockRestore()
  })
})
