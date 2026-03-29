---
layout: page
title: API 参考
nav_order: 3
---

[日本語](../api) \| [English](../en/api)

# API 参考

云端配送模式使用的 REST API 参考。

基础 URL：`https://<API_ID>.execute-api.<REGION>.amazonaws.com/v1`

需要认证的端点使用 Cognito JWT（`Authorization: Bearer <JWT>`）。

---

## 通知接收

### POST /webhooks/{token}

接收游戏事件通知并从云端通过 Webhook 发送。无需认证（令牌充当认证）。

**路径参数**

| 参数    | 说明                       |
| ------- | -------------------------- |
| `token` | 通知令牌（在设置画面发行） |

**请求体**

```json
{
  "message": "远征完成：第1舰队",
  "title": "远征完成",
  "type": "expedition"
}
```

| 字段      | 类型   | 说明                                                 |
| --------- | ------ | ---------------------------------------------------- |
| `message` | string | 通知消息正文                                         |
| `title`   | string | 通知标题                                             |
| `type`    | string | `expedition` / `repair` / `construction` / `default` |

**响应**：`{ "ok": true }`

**错误**

| 代码 | 原因                       |
| ---- | -------------------------- |
| 400  | 未指定令牌或未设置 Webhook |
| 404  | 令牌不存在                 |

---

## 计时器同步

### PUT /timers

将游戏计时器状态同步到云端，并按完成时间安排通知。**认证**：需要 Cognito JWT

**请求体**

```json
{
  "timers": [
    {
      "type": "expedition",
      "slot": "1",
      "completesAt": "2024-01-01T12:00:00.000Z",
      "message": "远征完成：第1舰队"
    }
  ],
  "enabled": {
    "expedition": true,
    "repair": true,
    "construction": true
  },
  "notifyBeforeMinutes": 1,
  "mobileOnly": false
}
```

| 字段                   | 类型    | 说明                                                 |
| ---------------------- | ------- | ---------------------------------------------------- |
| `timers`               | array   | 计时器数组                                           |
| `timers[].type`        | string  | `expedition` / `repair` / `construction`             |
| `timers[].slot`        | string  | 插槽编号                                             |
| `timers[].completesAt` | string  | 完成时间（ISO 8601）                                 |
| `timers[].message`     | string  | 通知消息（省略时使用默认标题）                       |
| `enabled`              | object  | 按类型启用/禁用（默认：全部 `true`）                 |
| `notifyBeforeMinutes`  | number  | 完成前多少分钟通知（0–60，默认：1）                  |
| `mobileOnly`           | boolean | `true` 时不发送 Webhook（仅移动应用）。默认：`false` |

`timers` 为空数组时，取消所有已安排的通知（登出时使用）。

### GET /timers

返回已同步的计时器列表（排除已过期的）。用于移动应用的后台同步。

**认证**：需要 Cognito JWT

**响应**

```json
{
  "timers": [
    {
      "type": "expedition",
      "slot": "1",
      "completesAt": "2024-01-01T12:00:00.000Z",
      "message": "远征完成：第1舰队",
      "notifyBeforeMinutes": 1
    }
  ]
}
```

---

## 账户管理

### DELETE /account

永久删除账户及所有相关数据。从所有 DynamoDB 表中删除用户数据、取消 EventBridge 调度、删除 Cognito 用户。

**认证**：需要 Cognito JWT

**响应**：`{ "ok": true }`

**删除的数据：**

- 账户设置（Webhook 配置）
- 通知令牌
- 计时器状态和配送调度
- 通知统计
- 推送令牌
- Cognito 用户

### GET /account/config — 获取 Webhook 设置。**认证**：需要 Cognito JWT

### PUT /account/config — 更新 Webhook 设置。**认证**：需要 Cognito JWT

```json
{
  "webhookType": "discord",
  "webhookUrl": "https://discord.com/api/webhooks/..."
}
```

| 字段          | 类型   | 说明                                                     |
| ------------- | ------ | -------------------------------------------------------- |
| `webhookType` | string | `discord` / `slack` / `none`（`none` 删除 Webhook 设置） |
| `webhookUrl`  | string | Webhook URL（`webhookType` 非 `none` 时必填）            |

---

## 推送令牌管理

### PUT /push-tokens

将移动应用的 Expo Push Token 注册到服务器。用于静默推送通知的即时计时器同步。

**认证**：需要 Cognito JWT

**请求体**

```json
{
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

| 字段        | 类型   | 说明                                              |
| ----------- | ------ | ------------------------------------------------- |
| `pushToken` | string | Expo Push Token（通过 `expo-notifications` 获取） |

**响应**：`{ "ok": true }`

**错误**

| 代码 | 原因                           |
| ---- | ------------------------------ |
| 400  | `pushToken` 未指定或不是字符串 |
| 401  | 未认证                         |

### DELETE /push-tokens

删除已注册的推送令牌（登出时使用）。**认证**：需要 Cognito JWT

**请求体**

```json
{
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

**响应**：`{ "ok": true }`

---

## 令牌管理

### POST /tokens — 发行新令牌。**认证**：需要 Cognito JWT

### GET /tokens — 返回已发行令牌列表。**认证**：需要 Cognito JWT

### DELETE /tokens/{token} — 删除令牌。**认证**：需要 Cognito JWT

---

## 错误报告

### POST /errors

从客户端（移动应用或 poi 插件）提交错误日志。无需认证。

**请求体**

```json
{
  "source": "mobile-app",
  "level": "error",
  "message": "Failed to sync timers",
  "stack": "Error: ...",
  "context": { "screen": "home" }
}
```

| 字段      | 类型   | 说明                                |
| --------- | ------ | ----------------------------------- |
| `source`  | string | `mobile-app` / `poi-plugin`（必填） |
| `level`   | string | `error` / `warn`（默认：`error`）   |
| `message` | string | 错误消息（必填，最多 1000 字符）    |
| `stack`   | string | 堆栈跟踪（可选，最多 5000 字符）    |
| `context` | object | 附加上下文信息（可选）              |

**响应**：`{ "ok": true }`

**错误**

| 代码 | 原因                                              |
| ---- | ------------------------------------------------- |
| 400  | 无效 JSON，或 `source` / `level` / `message` 无效 |
| 413  | 请求体超过 10KB                                   |

### GET /errors

返回错误日志列表。**认证**：需要 Cognito JWT

**查询参数**

| 参数     | 类型   | 说明                                              |
| -------- | ------ | ------------------------------------------------- |
| `source` | string | `mobile-app` / `poi-plugin`（默认：`mobile-app`） |
| `limit`  | number | 获取条数（最大 200，默认：50）                    |
| `since`  | string | 返回此时间之后的日志（ISO 8601）                  |
| `cursor` | string | 分页游标                                          |

**响应**

```json
{
  "errors": [
    {
      "id": "...",
      "source": "mobile-app",
      "timestamp": "2024-01-01T12:00:00.000Z",
      "level": "error",
      "message": "Failed to sync timers",
      "stack": "Error: ...",
      "context": {}
    }
  ],
  "cursor": "..."
}
```

### GET /dashboard

返回错误日志查看用的 HTML 仪表盘。无需认证（仪表盘内通过 Cognito OAuth 登录）。
