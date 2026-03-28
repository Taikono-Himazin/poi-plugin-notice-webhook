'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const {
  SchedulerClient,
  CreateScheduleCommand,
  UpdateScheduleCommand,
  DeleteScheduleCommand,
} = require('@aws-sdk/client-scheduler');
const crypto = require('crypto');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const scheduler = new SchedulerClient({});

const ok = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) });
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) });
const cors = () => ({ 'Access-Control-Allow-Origin': '*' });

// EventBridge Scheduler で許可された文字のみに正規化
const safeScheduleName = (userId, type, slot) => {
  const hash = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 8);
  return `poi-timer-${hash}-${type}-${slot}`;
};

const TYPE_TITLES = {
  expedition: '遠征完了',
  repair: '入渠完了',
  construction: '建造完了',
};

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return err(401, 'Unauthorized');

  // アカウントの webhook 設定を取得
  const accountRes = await dynamo.send(
    new GetCommand({
      TableName: process.env.ACCOUNTS_TABLE,
      Key: { userId },
    }),
  );

  const body = JSON.parse(event.body || '{}');
  const timers = Array.isArray(body.timers) ? body.timers : [];
  const enabled = body.enabled ?? { expedition: true, repair: true, construction: true };
  const notifyBeforeMinutes = Math.max(0, Math.min(60, parseInt(body.notifyBeforeMinutes, 10) || 1));
  const mobileOnly = body.mobileOnly === true;

  if (!mobileOnly && !accountRes.Item?.webhookType) {
    return err(400, 'Webhook config not set. Please configure via PUT /account/config.');
  }

  const deliveryTarget = mobileOnly
    ? { type: 'none' }
    : {
        type: accountRes.Item.webhookType,
        url: accountRes.Item.webhookUrl || '',
        lineToken: accountRes.Item.webhookLineToken || '',
      };

  // 既存タイマーを全削除（スケジュールキャンセル + DynamoDB 削除）
  const existingRes = await dynamo.send(
    new QueryCommand({
      TableName: process.env.TIMERS_TABLE,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    }),
  );

  await Promise.all(
    (existingRes.Items || []).map(async (item) => {
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
      await dynamo.send(
        new DeleteCommand({
          TableName: process.env.TIMERS_TABLE,
          Key: { userId, pk: item.pk },
        }),
      );
    }),
  );

  // 新しいタイマーを登録
  const now = Date.now();
  let scheduled = 0;

  for (const timer of timers) {
    const { type, slot, completesAt, message } = timer;
    if (!type || !slot || !completesAt) continue;
    if (enabled[type] === false) continue;

    const completesAtMs = new Date(completesAt).getTime();
    if (isNaN(completesAtMs) || completesAtMs <= now) continue;

    const pk = `${type}#${slot}`;
    const msgText = message || `${TYPE_TITLES[type] ?? 'poi 通知'}`;

    if (deliveryTarget.type === 'none') {
      // Webhook なし: タイマー状態のみ保存（モバイルアプリ用）
      await dynamo.send(
        new PutCommand({
          TableName: process.env.TIMERS_TABLE,
          Item: {
            userId,
            pk,
            type,
            slot,
            completesAt,
            message: msgText,
            notifyBeforeMinutes,
            ttl: Math.floor(completesAtMs / 1000) + 86400,
          },
        }),
      );
    } else {
      const notificationId = crypto.randomUUID();
      const scheduleName = safeScheduleName(userId, type, slot);
      const deliverAt = new Date(completesAtMs - notifyBeforeMinutes * 60 * 1000);
      const payload = { message: msgText, type, title: TYPE_TITLES[type] ?? 'poi 通知' };

      await dynamo.send(
        new PutCommand({
          TableName: process.env.NOTIFICATIONS_TABLE,
          Item: {
            id: notificationId,
            tokenItem: deliveryTarget,
            payload,
            ttl: Math.floor(completesAtMs / 1000) + 86400,
          },
        }),
      );

      await dynamo.send(
        new PutCommand({
          TableName: process.env.TIMERS_TABLE,
          Item: {
            userId,
            pk,
            type,
            slot,
            completesAt,
            message: payload.message,
            notifyBeforeMinutes,
            scheduleName,
            notificationId,
            ttl: Math.floor(completesAtMs / 1000) + 86400,
          },
        }),
      );

      const scheduleExpr = deliverAt.toISOString().replace(/\.\d{3}Z$/, '');
      const scheduleParams = {
        Name: scheduleName,
        ScheduleExpression: `at(${scheduleExpr})`,
        ScheduleExpressionTimezone: 'UTC',
        FlexibleTimeWindow: { Mode: 'OFF' },
        Target: {
          Arn: process.env.DELIVER_FUNCTION_ARN,
          RoleArn: process.env.SCHEDULER_ROLE_ARN,
          Input: JSON.stringify({ notificationId }),
        },
        ActionAfterCompletion: 'DELETE',
      };
      try {
        await scheduler.send(new CreateScheduleCommand(scheduleParams));
      } catch (e) {
        if (e.name === 'ConflictException') {
          await scheduler.send(new UpdateScheduleCommand(scheduleParams));
        } else {
          throw e;
        }
      }
    }

    scheduled++;
  }

  // ---- サイレントプッシュ送信（fire-and-forget）----
  try {
    const pushTokensRes = await dynamo.send(
      new QueryCommand({
        TableName: process.env.PUSH_TOKENS_TABLE,
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
      }),
    );

    const pushTokens = (pushTokensRes.Items || []).map((item) => item.pushToken);

    if (pushTokens.length > 0) {
      const messages = pushTokens.map((token) => ({
        to: token,
        sound: null,
        priority: 'high',
        _contentAvailable: true,
        data: { type: 'timer-sync' },
      }));

      const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });

      // 無効なトークンをクリーンアップ
      const pushResult = await pushRes.json();
      if (pushResult.data) {
        for (let i = 0; i < pushResult.data.length; i++) {
          if (pushResult.data[i].status === 'error' && pushResult.data[i].details?.error === 'DeviceNotRegistered') {
            await dynamo
              .send(
                new DeleteCommand({
                  TableName: process.env.PUSH_TOKENS_TABLE,
                  Key: { userId, pushToken: pushTokens[i] },
                }),
              )
              .catch(() => {});
          }
        }
      }
    }
  } catch {
    // サイレントプッシュの失敗はタイマー同期に影響させない
  }

  return ok({ ok: true, scheduled });
};
