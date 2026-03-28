'use strict'

const { mockClient } = require('aws-sdk-client-mock')
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb')

const ddbMock = mockClient(DynamoDBDocumentClient)

beforeEach(() => {
  ddbMock.reset()
  process.env.PUSH_TOKENS_TABLE = 'push-tokens'
})

const { handler } = require('../../src/push-tokens/register')

const makeEvent = (userId, body = {}) => ({
  requestContext: { authorizer: { claims: { sub: userId } } },
  body: JSON.stringify(body),
})

describe('PUT /push-tokens (register)', () => {
  test('未認証なら 401', async () => {
    const res = await handler({ requestContext: {}, body: '{}' })
    expect(res.statusCode).toBe(401)
  })

  test('pushToken が未指定なら 400', async () => {
    const res = await handler(makeEvent('user-1', {}))
    expect(res.statusCode).toBe(400)
  })

  test('pushToken が文字列でなければ 400', async () => {
    const res = await handler(makeEvent('user-1', { pushToken: 123 }))
    expect(res.statusCode).toBe(400)
  })

  test('正常にトークンを登録できる', async () => {
    ddbMock.on(PutCommand).resolves({})

    const res = await handler(makeEvent('user-1', {
      pushToken: 'ExponentPushToken[test-token]',
    }))

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).ok).toBe(true)

    const putCalls = ddbMock.commandCalls(PutCommand)
    expect(putCalls).toHaveLength(1)

    const item = putCalls[0].args[0].input.Item
    expect(item.userId).toBe('user-1')
    expect(item.pushToken).toBe('ExponentPushToken[test-token]')
    expect(item.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })
})
