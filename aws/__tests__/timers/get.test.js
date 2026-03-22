'use strict'

const { mockClient } = require('aws-sdk-client-mock')
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb')

const ddbMock = mockClient(DynamoDBDocumentClient)

beforeEach(() => {
  ddbMock.reset()
  process.env.TIMERS_TABLE = 'timers'
})

const { handler } = require('../../src/timers/get')

const makeEvent = (userId) => ({
  requestContext: { authorizer: { claims: { sub: userId } } },
})

describe('GET /timers', () => {
  test('未認証なら 401', async () => {
    const res = await handler({ requestContext: {} })
    expect(res.statusCode).toBe(401)
  })

  test('有効なタイマーのみ返す', async () => {
    const future = new Date(Date.now() + 3600_000).toISOString()
    const past = new Date(Date.now() - 1000).toISOString()

    ddbMock.on(QueryCommand).resolves({
      Items: [
        { userId: 'user-1', pk: 'expedition#2', type: 'expedition', slot: 2, completesAt: future, message: '遠征完了' },
        { userId: 'user-1', pk: 'repair#1', type: 'repair', slot: 1, completesAt: past, message: '入渠完了' },
      ],
    })

    const res = await handler(makeEvent('user-1'))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.timers).toHaveLength(1)
    expect(body.timers[0].type).toBe('expedition')
  })

  test('タイマーが無い場合は空配列を返す', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] })

    const res = await handler(makeEvent('user-1'))
    const body = JSON.parse(res.body)
    expect(body.timers).toEqual([])
  })

  test('不要なフィールド (scheduleName, notificationId) は返さない', async () => {
    const future = new Date(Date.now() + 3600_000).toISOString()
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { userId: 'u', pk: 'expedition#2', type: 'expedition', slot: 2, completesAt: future, message: 'msg', scheduleName: 'sch-1', notificationId: 'nid-1' },
      ],
    })

    const res = await handler(makeEvent('u'))
    const timer = JSON.parse(res.body).timers[0]
    expect(timer.scheduleName).toBeUndefined()
    expect(timer.notificationId).toBeUndefined()
    expect(timer).toEqual({
      type: 'expedition',
      slot: 2,
      completesAt: future,
      message: 'msg',
    })
  })
})
