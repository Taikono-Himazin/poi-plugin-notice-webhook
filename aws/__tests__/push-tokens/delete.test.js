'use strict';

const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  process.env.PUSH_TOKENS_TABLE = 'push-tokens';
});

const { handler } = require('../../src/push-tokens/delete');

const makeEvent = (userId, body = {}) => ({
  requestContext: { authorizer: { claims: { sub: userId } } },
  body: JSON.stringify(body),
});

describe('DELETE /push-tokens', () => {
  test('未認証なら 401', async () => {
    const res = await handler({ requestContext: {}, body: '{}' });
    expect(res.statusCode).toBe(401);
  });

  test('pushToken が未指定なら 400', async () => {
    const res = await handler(makeEvent('user-1', {}));
    expect(res.statusCode).toBe(400);
  });

  test('正常にトークンを削除できる', async () => {
    ddbMock.on(DeleteCommand).resolves({});

    const res = await handler(
      makeEvent('user-1', {
        pushToken: 'ExponentPushToken[test-token]',
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);

    const deleteCalls = ddbMock.commandCalls(DeleteCommand);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].args[0].input.Key).toEqual({
      userId: 'user-1',
      pushToken: 'ExponentPushToken[test-token]',
    });
  });
});
