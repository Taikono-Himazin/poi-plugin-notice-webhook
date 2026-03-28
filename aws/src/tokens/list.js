'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ok = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) });
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) });
const cors = () => ({ 'Access-Control-Allow-Origin': '*' });

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return err(401, 'Unauthorized');

  const res = await dynamo.send(
    new QueryCommand({
      TableName: process.env.TOKENS_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    }),
  );

  // lineToken はマスクして返す
  const tokens = (res.Items ?? []).map(({ lineToken: _lt, ...rest }) => ({
    ...rest,
    lineToken: _lt ? '***' : '',
    webhookUrl: `https://${event.requestContext.domainName}/${event.requestContext.stage}/webhooks/${rest.token}`,
  }));

  return ok({ tokens });
};
