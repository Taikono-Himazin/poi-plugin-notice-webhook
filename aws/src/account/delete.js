'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityProviderClient, AdminDeleteUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { SchedulerClient, DeleteScheduleCommand } = require('@aws-sdk/client-scheduler');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});
const scheduler = new SchedulerClient({});

const ok = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) });
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) });
const cors = () => ({ 'Access-Control-Allow-Origin': '*' });

async function deleteAllByPartitionKey(tableName, pkName, pkValue, skName) {
  const keyNames = [pkName];
  if (skName) keyNames.push(skName);

  let lastKey;
  do {
    const res = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: `${pkName} = :pk`,
        ExpressionAttributeValues: { ':pk': pkValue },
        ProjectionExpression: keyNames.join(', '),
        ExclusiveStartKey: lastKey,
      }),
    );
    const items = res.Items || [];
    // BatchWrite は25件ずつ
    for (let i = 0; i < items.length; i += 25) {
      const batch = items.slice(i, i + 25).map((item) => {
        const key = {};
        for (const k of keyNames) key[k] = item[k];
        return { DeleteRequest: { Key: key } };
      });
      await dynamo.send(
        new BatchWriteCommand({
          RequestItems: { [tableName]: batch },
        }),
      );
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
}

async function deleteTokensByUserId(tableName, userId) {
  let lastKey;
  do {
    const res = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
        ProjectionExpression: 'token',
        ExclusiveStartKey: lastKey,
      }),
    );
    const items = res.Items || [];
    for (let i = 0; i < items.length; i += 25) {
      const batch = items.slice(i, i + 25).map((item) => ({
        DeleteRequest: { Key: { token: item.token } },
      }));
      await dynamo.send(
        new BatchWriteCommand({
          RequestItems: { [tableName]: batch },
        }),
      );
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
}

/**
 * タイマーを削除し、紐づく EventBridge スケジュールと通知レコードもクリーンアップする。
 */
async function deleteTimersWithSchedules(userId) {
  let lastKey;
  do {
    const res = await dynamo.send(
      new QueryCommand({
        TableName: process.env.TIMERS_TABLE,
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
        ExclusiveStartKey: lastKey,
      }),
    );
    const items = res.Items || [];

    // EventBridge スケジュールと通知レコードを削除
    await Promise.all(
      items.map(async (item) => {
        if (item.scheduleName) {
          await scheduler.send(new DeleteScheduleCommand({ Name: item.scheduleName })).catch(() => {});
        }
        if (item.notificationId) {
          await dynamo
            .send(
              new DeleteCommand({
                TableName: process.env.NOTIFICATIONS_TABLE,
                Key: { id: item.notificationId },
              }),
            )
            .catch(() => {});
        }
      }),
    );

    // タイマーレコード自体を削除
    for (let i = 0; i < items.length; i += 25) {
      const batch = items.slice(i, i + 25).map((item) => ({
        DeleteRequest: { Key: { userId: item.userId, pk: item.pk } },
      }));
      await dynamo.send(
        new BatchWriteCommand({
          RequestItems: { [process.env.TIMERS_TABLE]: batch },
        }),
      );
    }

    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
}

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return err(401, 'Unauthorized');

  const username = event.requestContext?.authorizer?.claims?.['cognito:username'] || userId;

  // 全テーブルのユーザーデータを削除
  await Promise.all([
    deleteAllByPartitionKey(process.env.ACCOUNTS_TABLE, 'userId', userId),
    deleteTokensByUserId(process.env.TOKENS_TABLE, userId),
    deleteTimersWithSchedules(userId),
    deleteAllByPartitionKey(process.env.STATS_TABLE, 'userId', userId, 'month'),
    deleteAllByPartitionKey(process.env.PUSH_TOKENS_TABLE, 'userId', userId, 'pushToken'),
  ]);

  // Cognito ユーザーを削除
  await cognito.send(
    new AdminDeleteUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: username,
    }),
  );

  return ok({ ok: true });
};
