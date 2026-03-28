'use strict';

const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  process.env.TOKENS_TABLE = 'tokens';
});

const { handler } = require('../../src/tokens/delete');

const makeEvent = (userId, token) => ({
  requestContext: {
    authorizer: { claims: { sub: userId } },
  },
  pathParameters: { token },
});

describe('DELETE /tokens/:token', () => {
  test('未認証なら 401 を返す', async () => {
    const res = await handler({ requestContext: {} });
    expect(res.statusCode).toBe(401);
  });

  test('token パラメータが無い場合は 400', async () => {
    const res = await handler({
      requestContext: { authorizer: { claims: { sub: 'user-1' } } },
      pathParameters: {},
    });
    expect(res.statusCode).toBe(400);
  });

  test('存在しないトークンは 404', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const res = await handler(makeEvent('user-1', 'nonexistent'));
    expect(res.statusCode).toBe(404);
  });

  test('他人のトークンは 403', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { token: 'tok-1', userId: 'other-user' },
    });

    const res = await handler(makeEvent('user-1', 'tok-1'));
    expect(res.statusCode).toBe(403);
  });

  test('自分のトークンを正常に削除できる', async () => {
    ddbMock
      .on(GetCommand)
      .resolves({ Item: { token: 'tok-1', userId: 'user-1' } })
      .on(DeleteCommand)
      .resolves({});

    const res = await handler(makeEvent('user-1', 'tok-1'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);

    const deleteCalls = ddbMock.commandCalls(DeleteCommand);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].args[0].input.Key).toEqual({ token: 'tok-1' });
  });
});
