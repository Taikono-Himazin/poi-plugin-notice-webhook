---
layout: page
title: API Reference
nav_order: 3
---

[日本語](../api) \| [中文](../zh/api)

# API Reference

REST API reference for cloud delivery mode.

Base URL: `https://<API_ID>.execute-api.<REGION>.amazonaws.com/v1`

Endpoints requiring authentication use Cognito JWT (`Authorization: Bearer <JWT>`).

---

## Notification Ingestion

### POST /webhooks/{token}

Receives a game event notification and delivers it via Webhook from the cloud. No authentication required (the token serves as authentication).

**Path Parameters**

| Parameter | Description |
|---|---|
| `token` | Notification token (issued in settings) |

**Request Body**

```json
{
  "message": "Expedition complete: Fleet 1",
  "title": "Expedition Complete",
  "type": "expedition",
  "deliverAfterMinutes": 0
}
```

| Field | Type | Description |
|---|---|---|
| `message` | string | Notification message body |
| `title` | string | Notification title |
| `type` | string | `expedition` / `repair` / `construction` / `default` |
| `deliverAfterMinutes` | number | Delivery delay (minutes). Paid plan only. 0 = immediate |

**Response**: `{ "ok": true }`

**Errors**

| Code | Reason |
|---|---|
| 400 | Missing token or Webhook not configured |
| 404 | Token not found |
| 429 | Free plan monthly limit (30) exceeded |

---

## Timer Sync

### PUT /timers

Syncs game timer state to the cloud and schedules notifications at completion times. **Auth**: Cognito JWT required

**Request Body**

```json
{
  "timers": [
    {
      "type": "expedition",
      "slot": "1",
      "completesAt": "2024-01-01T12:00:00.000Z",
      "message": "Expedition complete: Fleet 1"
    }
  ],
  "enabled": {
    "expedition": true,
    "repair": true,
    "construction": true
  }
}
```

An empty `timers` array cancels all existing schedules (used on logout).

---

## Account Config

### GET /account/config

Returns Webhook configuration. **Auth**: Cognito JWT required

### PUT /account/config

Updates Webhook configuration. **Auth**: Cognito JWT required

```json
{
  "webhookType": "discord",
  "webhookUrl": "https://discord.com/api/webhooks/...",
  "deliverBeforeMinutes": 1
}
```

---

## Token Management

### POST /tokens — Issue a new token. **Auth**: Cognito JWT required

### GET /tokens — List issued tokens. **Auth**: Cognito JWT required

### DELETE /tokens/{token} — Delete a token. **Auth**: Cognito JWT required

---

## Billing

### GET /billing/checkout?plan={plan}

Creates a PAY.JP v2 checkout session and returns the payment page URL. **Auth**: Cognito JWT required

| Parameter | Value | Description |
|---|---|---|
| `plan` | `1m` / `6m` / `12m` | Plan to purchase |

### GET /billing/status

Returns subscription status. **Auth**: Cognito JWT required

```json
{
  "plan": "paid",
  "subscriptionStatus": "active",
  "paidUntil": 1740000000000,
  "notificationCount": 12,
  "monthlyLimit": null
}
```

| Field | Description |
|---|---|
| `plan` | `"paid"` or `"free"` |
| `subscriptionStatus` | `"active"` / `"inactive"` / `"canceled"` |
| `paidUntil` | Expiry timestamp (Unix ms). `null` = no expiry |
| `notificationCount` | Notifications sent this month |
| `monthlyLimit` | Monthly limit (free: 30, paid: `null` = unlimited) |
