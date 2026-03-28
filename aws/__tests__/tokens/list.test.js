'use strict';

const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  process.env.TOKENS_TABLE = 'tokens';
});

const { handler } = require('../../src/tokens/list');

const makeEvent = (userId) => ({
  requestContext: {
    authorizer: { claims: { sub: userId } },
    domainName: 'api.example.com',
    stage: 'v1',
  },
});

describe('GET /tokens (list)', () => {
  test('未認証なら 401 を返す', async () => {
    const res = await handler({ requestContext: {} });
    expect(res.statusCode).toBe(401);
  });

  test('トークン一覧を返す', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { token: 'tok-1', userId: 'user-1', createdAt: 1000 },
        { token: 'tok-2', userId: 'user-1', createdAt: 2000 },
      ],
    });

    const res = await handler(makeEvent('user-1'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.tokens).toHaveLength(2);
    expect(body.tokens[0].webhookUrl).toContain('/webhooks/tok-1');
  });

  test('lineToken をマスクして返す', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ token: 'tok-1', userId: 'user-1', lineToken: 'secret-token-value' }],
    });

    const res = await handler(makeEvent('user-1'));
    const body = JSON.parse(res.body);
    expect(body.tokens[0].lineToken).toBe('***');
  });

  test('lineToken が空なら空文字を返す', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ token: 'tok-1', userId: 'user-1' }],
    });

    const res = await handler(makeEvent('user-1'));
    const body = JSON.parse(res.body);
    expect(body.tokens[0].lineToken).toBe('');
  });

  test('トークンが無い場合は空配列を返す', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const res = await handler(makeEvent('user-1'));
    const body = JSON.parse(res.body);
    expect(body.tokens).toEqual([]);
  });
});
