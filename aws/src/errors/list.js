'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ok = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) });
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) });
const cors = () => ({ 'Access-Control-Allow-Origin': '*' });

const VALID_SOURCES = ['mobile-app', 'poi-plugin'];

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return err(401, 'Unauthorized');

  const qs = event.queryStringParameters || {};
  const source = qs.source || 'mobile-app';
  const limit = Math.min(parseInt(qs.limit, 10) || 50, 200);
  const since = qs.since || '';

  if (!VALID_SOURCES.includes(source)) return err(400, 'Invalid source');

  const params = {
    TableName: process.env.ERRORS_TABLE,
    KeyConditionExpression: since ? 'source = :src AND #ts >= :since' : 'source = :src',
    ExpressionAttributeValues: { ':src': source },
    ScanIndexForward: false, // 新しい順
    Limit: limit,
  };

  if (since) {
    params.ExpressionAttributeValues[':since'] = since;
    params.ExpressionAttributeNames = { '#ts': 'timestamp' };
  } else {
    params.ExpressionAttributeNames = { '#ts': 'timestamp' };
    // timestamp は予約語なので常にエイリアスが必要
    // since なしの場合は KeyConditionExpression にエイリアス不要だが統一のため残す
    delete params.ExpressionAttributeNames;
  }

  if (qs.cursor) {
    try {
      params.ExclusiveStartKey = JSON.parse(Buffer.from(qs.cursor, 'base64url').toString());
    } catch (_) {
      return err(400, 'Invalid cursor');
    }
  }

  const res = await dynamo.send(new QueryCommand(params));

  const items = (res.Items || []).map((item) => ({
    id: item.id,
    source: item.source,
    timestamp: item.timestamp,
    level: item.level,
    message: item.message,
    stack: item.stack,
    context: item.context,
  }));

  const result = { errors: items };
  if (res.LastEvaluatedKey) {
    result.cursor = Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString('base64url');
  }

  return ok(result);
};
