'use strict'

const { mockClient } = require('aws-sdk-client-mock')
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb')

const ddbMock = mockClient(DynamoDBDocumentClient)

beforeEach(() => {
  ddbMock.reset()
  process.env.TOKENS_TABLE = 'tokens'
  process.env.ACCOUNTS_TABLE = 'accounts'
})

const { handler } = require('../../src/tokens/create')

const makeEvent = (userId) => ({
  requestContext: {
    authorizer: { claims: { sub: userId } },
    domainName: 'api.example.com',
    stage: 'v1',
  },
})

describe('POST /tokens (create)', () => {
  test('未認証なら 401 を返す', async () => {
    const res = await handler({ requestContext: {} })
    expect(res.statusCode).toBe(401)
  })

  test('トークンを正常に作成できる', async () => {
    ddbMock
      .on(QueryCommand).resolves({ Count: 0, Items: [] })
      .on(PutCommand).resolves({})

    // getAccount + isPaidActive 用のモック (subscription.js が内部で使う)
    const { GetCommand } = require('@aws-sdk/lib-dynamodb')
    ddbMock.on(GetCommand).resolves({ Item: { userId: 'user-1', plan: 'free' } })

    const res = await handler(makeEvent('user-1'))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.token).toBeDefined()
    expect(body.webhookUrl).toContain('/webhooks/')
  })

  test('free プランでトークン上限 (1) に達したら 403', async () => {
    const { GetCommand } = require('@aws-sdk/lib-dynamodb')
    ddbMock
      .on(GetCommand).resolves({ Item: { userId: 'user-1', plan: 'free' } })
      .on(QueryCommand).resolves({ Count: 1, Items: [{}] })

    const res = await handler(makeEvent('user-1'))
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error).toContain('limit')
  })

  test('paid プランなら上限 10 まで作成できる', async () => {
    const { GetCommand } = require('@aws-sdk/lib-dynamodb')
    ddbMock
      .on(GetCommand).resolves({
        Item: { userId: 'user-1', plan: 'paid', subscriptionStatus: 'active' },
      })
      .on(QueryCommand).resolves({ Count: 5, Items: Array(5).fill({}) })
      .on(PutCommand).resolves({})

    const res = await handler(makeEvent('user-1'))
    expect(res.statusCode).toBe(200)
  })

  test('paid プランでも上限 10 に達したら 403', async () => {
    const { GetCommand } = require('@aws-sdk/lib-dynamodb')
    ddbMock
      .on(GetCommand).resolves({
        Item: { userId: 'user-1', plan: 'paid', subscriptionStatus: 'active' },
      })
      .on(QueryCommand).resolves({ Count: 10, Items: Array(10).fill({}) })

    const res = await handler(makeEvent('user-1'))
    expect(res.statusCode).toBe(403)
  })
})
