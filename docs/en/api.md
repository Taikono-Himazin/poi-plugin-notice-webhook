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
  "type": "expedition"
}
```

| Field | Type | Description |
|---|---|---|
| `message` | string | Notification message body |
| `title` | string | Notification title |
| `type` | string | `expedition` / `repair` / `construction` / `default` |

**Response**: `{ "ok": true }`

**Errors**

| Code | Reason |
|---|---|
| 400 | Missing token or Webhook not configured |
| 404 | Token not found |

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
  },
  "notifyBeforeMinutes": 1,
  "mobileOnly": false
}
```

| Field | Type | Description |
|---|---|---|
| `timers` | array | Array of timers |
| `timers[].type` | string | `expedition` / `repair` / `construction` |
| `timers[].slot` | string | Slot number |
| `timers[].completesAt` | string | Completion time (ISO 8601) |
| `timers[].message` | string | Notification message (defaults to type title if omitted) |
| `enabled` | object | Enable/disable per type (default: all `true`) |
| `notifyBeforeMinutes` | number | Minutes before completion to notify (0–60, default: 1) |
| `mobileOnly` | boolean | If `true`, skip Webhook delivery (mobile app only). Default: `false` |

An empty `timers` array cancels all existing schedules (used on logout).

### GET /timers

Returns the list of synced timers (expired timers are excluded). Used by the mobile app for background sync.

**Auth**: Cognito JWT required

**Response**

```json
{
  "timers": [
    {
      "type": "expedition",
      "slot": "1",
      "completesAt": "2024-01-01T12:00:00.000Z",
      "message": "Expedition complete: Fleet 1",
      "notifyBeforeMinutes": 1
    }
  ]
}
```

---

## Account Management

### DELETE /account

Permanently deletes the account and all associated data. Removes user data from all DynamoDB tables, cancels EventBridge schedules, and deletes the Cognito user.

**Auth**: Cognito JWT required

**Response**: `{ "ok": true }`

**Deleted data:**
- Account settings (Webhook config)
- Notification tokens
- Timer state and delivery schedules
- Notification statistics
- Push tokens
- Cognito user

### GET /account/config

Returns Webhook configuration. **Auth**: Cognito JWT required

### PUT /account/config

Updates Webhook configuration. **Auth**: Cognito JWT required

```json
{
  "webhookType": "discord",
  "webhookUrl": "https://discord.com/api/webhooks/..."
}
```

| Field | Type | Description |
|---|---|---|
| `webhookType` | string | `discord` / `slack` / `none` (`none` removes Webhook config) |
| `webhookUrl` | string | Webhook URL (required unless `webhookType` is `none`) |

---

## Push Token Management

### PUT /push-tokens

Registers the mobile app's Expo Push Token on the server. Used for silent push notification-based instant timer sync.

**Auth**: Cognito JWT required

**Request Body**

```json
{
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

| Field | Type | Description |
|---|---|---|
| `pushToken` | string | Expo Push Token (obtained via `expo-notifications`) |

**Response**: `{ "ok": true }`

**Errors**

| Code | Reason |
|---|---|
| 400 | `pushToken` missing or not a string |
| 401 | Not authenticated |

### DELETE /push-tokens

Deletes a registered push token (used on logout). **Auth**: Cognito JWT required

**Request Body**

```json
{
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

**Response**: `{ "ok": true }`

---

## Token Management

### POST /tokens — Issue a new token. **Auth**: Cognito JWT required

### GET /tokens — List issued tokens. **Auth**: Cognito JWT required

### DELETE /tokens/{token} — Delete a token. **Auth**: Cognito JWT required

---

## Error Reporting

### POST /errors

Submits error logs from clients (mobile app or poi plugin). No authentication required.

**Request Body**

```json
{
  "source": "mobile-app",
  "level": "error",
  "message": "Failed to sync timers",
  "stack": "Error: ...",
  "context": { "screen": "home" }
}
```

| Field | Type | Description |
|---|---|---|
| `source` | string | `mobile-app` / `poi-plugin` (required) |
| `level` | string | `error` / `warn` (default: `error`) |
| `message` | string | Error message (required, max 1000 chars) |
| `stack` | string | Stack trace (optional, max 5000 chars) |
| `context` | object | Additional context (optional) |

**Response**: `{ "ok": true }`

**Errors**

| Code | Reason |
|---|---|
| 400 | Invalid JSON, or invalid `source` / `level` / `message` |
| 413 | Request body exceeds 10KB |

### GET /errors

Returns error logs. **Auth**: Cognito JWT required

**Query Parameters**

| Parameter | Type | Description |
|---|---|---|
| `source` | string | `mobile-app` / `poi-plugin` (default: `mobile-app`) |
| `limit` | number | Number of items (max 200, default: 50) |
| `since` | string | Return logs after this timestamp (ISO 8601) |
| `cursor` | string | Pagination cursor |

**Response**

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

Returns an HTML dashboard for viewing error logs. No authentication required (Cognito OAuth login is handled within the dashboard).

