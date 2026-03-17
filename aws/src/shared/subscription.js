'use strict'

const { DynamoDBClient }      = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

async function getAccount(userId) {
  const res = await dynamo.send(new GetCommand({
    TableName: process.env.ACCOUNTS_TABLE,
    Key: { userId },
  }))
  return res.Item ?? null
}

function isPaidActive(account) {
  if (!account) return false
  if (account.plan !== 'paid') return false
  if (account.subscriptionStatus !== 'active') return false
  if (account.paidUntil != null && account.paidUntil <= Date.now()) return false
  return true
}

module.exports = { getAccount, isPaidActive }
