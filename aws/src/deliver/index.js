'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { deliverNotification } = require('../shared/deliver');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  const { notificationId } = event;

  const res = await dynamo.send(
    new GetCommand({
      TableName: process.env.NOTIFICATIONS_TABLE,
      Key: { id: notificationId },
    }),
  );
  if (!res.Item) return;

  const { tokenItem, payload } = res.Item;

  await deliverNotification(tokenItem, payload);

  await dynamo.send(
    new DeleteCommand({
      TableName: process.env.NOTIFICATIONS_TABLE,
      Key: { id: notificationId },
    }),
  );
};
