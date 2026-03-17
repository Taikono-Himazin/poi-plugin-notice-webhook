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

| 参数 | 说明 |
|---|---|
| `token` | 通知令牌（在设置画面发行） |

**请求体**

```json
{
  "message": "远征完成：第1舰队",
  "title": "远征完成",
  "type": "expedition",
  "deliverAfterMinutes": 0
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `message` | string | 通知消息正文 |
| `title` | string | 通知标题 |
| `type` | string | `expedition` / `repair` / `construction` / `default` |
| `deliverAfterMinutes` | number | 延迟配送（分钟）。仅付费套餐有效。0 为立即发送 |

**响应**：`{ "ok": true }`

**错误**

| 代码 | 原因 |
|---|---|
| 400 | 未指定令牌或未设置 Webhook |
| 404 | 令牌不存在 |
| 429 | 超过免费套餐月限（30 条） |

---

## 计时器同步

### PUT /timers

将游戏计时器状态同步到云端，并按完成时间安排通知。**认证**：需要 Cognito JWT

---

## 账户设置

### GET /account/config — 获取 Webhook 设置。**认证**：需要 Cognito JWT

### PUT /account/config — 更新 Webhook 设置。**认证**：需要 Cognito JWT

```json
{
  "webhookType": "discord",
  "webhookUrl": "https://discord.com/api/webhooks/...",
  "deliverBeforeMinutes": 1
}
```

---

## 令牌管理

### POST /tokens — 发行新令牌。**认证**：需要 Cognito JWT

### GET /tokens — 返回已发行令牌列表。**认证**：需要 Cognito JWT

### DELETE /tokens/{token} — 删除令牌。**认证**：需要 Cognito JWT

---

## 账单

### GET /billing/checkout?plan={plan}

创建 PAY.JP v2 结账会话并返回付款页面 URL。**认证**：需要 Cognito JWT

| 参数 | 值 | 说明 |
|---|---|---|
| `plan` | `1m` / `6m` / `12m` | 购买的套餐 |

### GET /billing/status

返回订阅状态。**认证**：需要 Cognito JWT

```json
{
  "plan": "paid",
  "subscriptionStatus": "active",
  "paidUntil": 1740000000000,
  "notificationCount": 12,
  "monthlyLimit": null
}
```

| 字段 | 说明 |
|---|---|
| `plan` | `"paid"` 或 `"free"` |
| `subscriptionStatus` | `"active"` / `"inactive"` / `"canceled"` |
| `paidUntil` | 到期时间戳（Unix ms）。`null` 表示无期限 |
| `notificationCount` | 本月发送的通知数 |
| `monthlyLimit` | 月限（免费：30，付费：`null` = 无限制） |
