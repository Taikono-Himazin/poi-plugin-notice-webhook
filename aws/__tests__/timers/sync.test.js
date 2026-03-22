'use strict'

const { mockClient } = require('aws-sdk-client-mock')
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb')
const { SchedulerClient, CreateScheduleCommand, DeleteScheduleCommand } = require('@aws-sdk/client-scheduler')

const ddbMock = mockClient(DynamoDBDocumentClient)
const schedulerMock = mockClient(SchedulerClient)

beforeEach(() => {
  ddbMock.reset()
  schedulerMock.reset()
  process.env.TIMERS_TABLE = 'timers'
  process.env.ACCOUNTS_TABLE = 'accounts'
  process.env.NOTIFICATIONS_TABLE = 'notifications'
  process.env.DELIVER_FUNCTION_ARN = 'arn:aws:lambda:ap-northeast-1:123:function:deliver'
  process.env.SCHEDULER_ROLE_ARN = 'arn:aws:iam::123:role/scheduler'
})

const { handler } = require('../../src/timers/sync')

const makeEvent = (userId, body = {}) => ({
  requestContext: { authorizer: { claims: { sub: userId } } },
  body: JSON.stringify(body),
})

describe('PUT /timers (sync)', () => {
  test('未認証なら 401', async () => {
    const res = await handler({ requestContext: {}, body: '{}' })
    expect(res.statusCode).toBe(401)
  })

  test('webhook 未設定で mobileOnly=false なら 400', async () => {
    ddbMock
      .on(GetCommand).resolves({ Item: { userId: 'user-1' } })

    const res = await handler(makeEvent('user-1', { timers: [] }))
    expect(res.statusCode).toBe(400)
  })

  test('mobileOnly=true なら webhook 未設定でも OK', async () => {
    ddbMock
      .on(GetCommand).resolves({ Item: { userId: 'user-1' } })
      .on(QueryCommand).resolves({ Items: [] })
      .on(PutCommand).resolves({})

    const future = new Date(Date.now() + 3600_000).toISOString()
    const res = await handler(makeEvent('user-1', {
      timers: [{ type: 'expedition', slot: 2, completesAt: future, message: '遠征完了' }],
      mobileOnly: true,
    }))

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).scheduled).toBe(1)
  })

  test('期限切れタイマーはスキップする', async () => {
    ddbMock
      .on(GetCommand).resolves({ Item: { userId: 'u', webhookType: 'discord', webhookUrl: 'https://x' } })
      .on(QueryCommand).resolves({ Items: [] })
      .on(PutCommand).resolves({})

    const past = new Date(Date.now() - 1000).toISOString()
    const res = await handler(makeEvent('u', {
      timers: [{ type: 'repair', slot: 1, completesAt: past, message: '入渠' }],
    }))

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).scheduled).toBe(0)
  })

  test('enabled=false のタイプはスキップする', async () => {
    ddbMock
      .on(GetCommand).resolves({ Item: { userId: 'u', webhookType: 'discord', webhookUrl: 'https://x' } })
      .on(QueryCommand).resolves({ Items: [] })
      .on(PutCommand).resolves({})

    const future = new Date(Date.now() + 3600_000).toISOString()
    const res = await handler(makeEvent('u', {
      timers: [
        { type: 'expedition', slot: 2, completesAt: future, message: '遠征' },
        { type: 'repair', slot: 1, completesAt: future, message: '入渠' },
      ],
      enabled: { expedition: true, repair: false, construction: true },
    }))

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).scheduled).toBe(1)
  })

  test('既存タイマーを削除してから新しいタイマーを登録する', async () => {
    ddbMock
      .on(GetCommand).resolves({ Item: { userId: 'u', webhookType: 'discord', webhookUrl: 'https://x' } })
      .on(QueryCommand).resolves({
        Items: [
          { userId: 'u', pk: 'expedition#2', scheduleName: 'old-schedule', notificationId: 'old-nid' },
        ],
      })
      .on(DeleteCommand).resolves({})
      .on(PutCommand).resolves({})

    schedulerMock
      .on(DeleteScheduleCommand).resolves({})
      .on(CreateScheduleCommand).resolves({})

    const future = new Date(Date.now() + 3600_000).toISOString()
    const res = await handler(makeEvent('u', {
      timers: [{ type: 'expedition', slot: 3, completesAt: future, message: '新しい遠征' }],
    }))

    expect(res.statusCode).toBe(200)

    // 古いスケジュールが削除された
    const deleteScheduleCalls = schedulerMock.commandCalls(DeleteScheduleCommand)
    expect(deleteScheduleCalls).toHaveLength(1)
    expect(deleteScheduleCalls[0].args[0].input.Name).toBe('old-schedule')

    // 新しいスケジュールが作成された
    const createScheduleCalls = schedulerMock.commandCalls(CreateScheduleCommand)
    expect(createScheduleCalls).toHaveLength(1)
  })

  test('type/slot/completesAt が欠けたタイマーはスキップする', async () => {
    ddbMock
      .on(GetCommand).resolves({ Item: { userId: 'u', webhookType: 'discord', webhookUrl: 'https://x' } })
      .on(QueryCommand).resolves({ Items: [] })

    const res = await handler(makeEvent('u', {
      timers: [
        { type: 'expedition', slot: 2 },            // completesAt 欠落
        { slot: 1, completesAt: '2099-01-01T00:00:00Z' }, // type 欠落
        { type: 'repair', completesAt: '2099-01-01T00:00:00Z' }, // slot 欠落
      ],
    }))

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).scheduled).toBe(0)
  })
})
