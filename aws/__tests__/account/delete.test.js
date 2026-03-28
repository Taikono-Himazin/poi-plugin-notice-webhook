'use strict';

const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityProviderClient, AdminDeleteUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { SchedulerClient, DeleteScheduleCommand } = require('@aws-sdk/client-scheduler');

const ddbMock = mockClient(DynamoDBDocumentClient);
const cognitoMock = mockClient(CognitoIdentityProviderClient);
const schedulerMock = mockClient(SchedulerClient);

beforeEach(() => {
  ddbMock.reset();
  cognitoMock.reset();
  schedulerMock.reset();
  process.env.ACCOUNTS_TABLE = 'accounts';
  process.env.TOKENS_TABLE = 'tokens';
  process.env.TIMERS_TABLE = 'timers';
  process.env.NOTIFICATIONS_TABLE = 'notifications';
  process.env.STATS_TABLE = 'stats';
  process.env.PUSH_TOKENS_TABLE = 'push-tokens';
  process.env.USER_POOL_ID = 'us-east-1_TestPool';
});

const { handler } = require('../../src/account/delete');

const makeEvent = (userId, username) => ({
  requestContext: {
    authorizer: {
      claims: {
        sub: userId,
        'cognito:username': username || userId,
      },
    },
  },
});

describe('DELETE /account', () => {
  test('未認証なら 401', async () => {
    const res = await handler({ requestContext: {} });
    expect(res.statusCode).toBe(401);
  });

  test('全テーブルのデータと Cognito ユーザーを削除する', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [], LastEvaluatedKey: undefined });
    cognitoMock.on(AdminDeleteUserCommand).resolves({});

    const res = await handler(makeEvent('user-1', 'testuser'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);

    const cognitoCalls = cognitoMock.commandCalls(AdminDeleteUserCommand);
    expect(cognitoCalls).toHaveLength(1);
    expect(cognitoCalls[0].args[0].input.UserPoolId).toBe('us-east-1_TestPool');
    expect(cognitoCalls[0].args[0].input.Username).toBe('testuser');
  });

  test('テーブルにデータがある場合 BatchWrite で削除する', async () => {
    ddbMock.on(QueryCommand, { TableName: 'accounts' }).resolves({
      Items: [{ userId: 'user-1' }],
    });
    ddbMock.on(QueryCommand, { TableName: 'tokens', IndexName: 'userId-index' }).resolves({
      Items: [{ token: 'tok-1' }, { token: 'tok-2' }],
    });
    // タイマー: スケジュール・通知なし
    ddbMock.on(QueryCommand, { TableName: 'timers' }).resolves({
      Items: [{ userId: 'user-1', pk: 'expedition#1' }],
    });
    ddbMock.on(QueryCommand, { TableName: 'stats' }).resolves({
      Items: [{ userId: 'user-1', month: '2024-01' }],
    });
    ddbMock.on(QueryCommand, { TableName: 'push-tokens' }).resolves({
      Items: [{ userId: 'user-1', pushToken: 'ExponentPushToken[xxx]' }],
    });

    ddbMock.on(BatchWriteCommand).resolves({});
    cognitoMock.on(AdminDeleteUserCommand).resolves({});

    const res = await handler(makeEvent('user-1'));
    expect(res.statusCode).toBe(200);

    const batchCalls = ddbMock.commandCalls(BatchWriteCommand);
    expect(batchCalls.length).toBe(5);
  });

  test('タイマーに紐づく EventBridge スケジュールと通知レコードを削除する', async () => {
    // 他テーブルは空
    ddbMock.on(QueryCommand, { TableName: 'accounts' }).resolves({ Items: [] });
    ddbMock.on(QueryCommand, { TableName: 'tokens', IndexName: 'userId-index' }).resolves({ Items: [] });
    ddbMock.on(QueryCommand, { TableName: 'stats' }).resolves({ Items: [] });
    ddbMock.on(QueryCommand, { TableName: 'push-tokens' }).resolves({ Items: [] });

    // タイマー: スケジュールと通知あり
    ddbMock.on(QueryCommand, { TableName: 'timers' }).resolves({
      Items: [
        { userId: 'user-1', pk: 'expedition#1', scheduleName: 'poi-timer-abc-expedition-1', notificationId: 'notif-1' },
        { userId: 'user-1', pk: 'repair#1', scheduleName: 'poi-timer-abc-repair-1' },
        { userId: 'user-1', pk: 'construction#1' }, // スケジュールなし
      ],
    });
    ddbMock.on(BatchWriteCommand).resolves({});
    ddbMock.on(DeleteCommand).resolves({});
    schedulerMock.on(DeleteScheduleCommand).resolves({});
    cognitoMock.on(AdminDeleteUserCommand).resolves({});

    const res = await handler(makeEvent('user-1'));
    expect(res.statusCode).toBe(200);

    // EventBridge スケジュールが 2 件削除された
    const schedulerCalls = schedulerMock.commandCalls(DeleteScheduleCommand);
    expect(schedulerCalls).toHaveLength(2);
    expect(schedulerCalls[0].args[0].input.Name).toBe('poi-timer-abc-expedition-1');
    expect(schedulerCalls[1].args[0].input.Name).toBe('poi-timer-abc-repair-1');

    // 通知レコードが 1 件削除された
    const deleteCalls = ddbMock.commandCalls(DeleteCommand);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].args[0].input.TableName).toBe('notifications');
    expect(deleteCalls[0].args[0].input.Key.id).toBe('notif-1');
  });

  test('cognito:username がない場合は sub をユーザー名として使う', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    cognitoMock.on(AdminDeleteUserCommand).resolves({});

    const event = {
      requestContext: {
        authorizer: { claims: { sub: 'user-1' } },
      },
    };
    const res = await handler(event);
    expect(res.statusCode).toBe(200);

    const cognitoCalls = cognitoMock.commandCalls(AdminDeleteUserCommand);
    expect(cognitoCalls[0].args[0].input.Username).toBe('user-1');
  });
});
