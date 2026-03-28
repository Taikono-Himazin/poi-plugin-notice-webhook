---
layout: page
title: API リファレンス
nav_order: 3
---

[English](en/api) \| [中文](zh/api)

# API リファレンス

クラウド配信モードで使用する REST API のリファレンスです。

ベース URL: `https://<API_ID>.execute-api.<REGION>.amazonaws.com/v1`

認証が必要なエンドポイントは Cognito JWT（`Authorization: Bearer <JWT>`）を使用します。

---

## 通知受信

### POST /webhooks/{token}

ゲームイベントの通知を受信してクラウドから Webhook に配信します。認証不要（トークンが認証の役割を担います）。

**パスパラメータ**

| パラメータ | 説明 |
|---|---|
| `token` | 通知トークン（設定画面で発行） |

**リクエストボディ**

```json
{
  "message": "遠征完了: 第1艦隊",
  "title": "遠征完了",
  "type": "expedition"
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `message` | string | 通知メッセージ本文 |
| `title` | string | 通知タイトル |
| `type` | string | `expedition` / `repair` / `construction` / `default` |

**レスポンス**

```json
{ "ok": true }
```

**エラー**

| コード | 原因 |
|---|---|
| 400 | トークン未指定、Webhook 未設定 |
| 404 | トークンが存在しない |

---

## タイマー同期

### PUT /timers

ゲームのタイマー状態をクラウドに同期し、完了時刻に合わせた通知をスケジュールします。

**認証**: Cognito JWT 必須

**リクエストボディ**

```json
{
  "timers": [
    {
      "type": "expedition",
      "slot": "1",
      "completesAt": "2024-01-01T12:00:00.000Z",
      "message": "遠征完了: 第1艦隊"
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

| フィールド | 型 | 説明 |
|---|---|---|
| `timers` | array | タイマー配列 |
| `timers[].type` | string | `expedition` / `repair` / `construction` |
| `timers[].slot` | string | スロット番号 |
| `timers[].completesAt` | string | 完了時刻（ISO 8601） |
| `timers[].message` | string | 通知メッセージ（省略時はデフォルトタイトル） |
| `enabled` | object | タイプごとの有効/無効（デフォルト: すべて `true`） |
| `notifyBeforeMinutes` | number | 完了何分前に通知するか（0〜60、デフォルト: 1） |
| `mobileOnly` | boolean | `true` の場合 Webhook 配信なし（モバイルアプリのみ）。デフォルト: `false` |

`timers` が空配列の場合、既存のスケジュールをすべてキャンセルします（ログアウト時に使用）。

### GET /timers

同期済みのタイマー一覧を取得します（期限切れは除外）。モバイルアプリのバックグラウンド同期で使用します。

**認証**: Cognito JWT 必須

**レスポンス**

```json
{
  "timers": [
    {
      "type": "expedition",
      "slot": "1",
      "completesAt": "2024-01-01T12:00:00.000Z",
      "message": "遠征完了: 第1艦隊",
      "notifyBeforeMinutes": 1
    }
  ]
}
```

---

## アカウント設定

### GET /account/config

Webhook 設定を取得します。**認証**: Cognito JWT 必須

**レスポンス**

```json
{
  "webhookType": "discord",
  "webhookUrl": "https://discord.com/api/webhooks/..."
}
```

### PUT /account/config

Webhook 設定を更新します。**認証**: Cognito JWT 必須

**リクエストボディ**

```json
{
  "webhookType": "discord",
  "webhookUrl": "https://discord.com/api/webhooks/..."
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `webhookType` | string | `discord` / `slack` / `none`（`none` で Webhook 設定を削除） |
| `webhookUrl` | string | Webhook URL（`webhookType` が `none` 以外の場合は必須） |

---

## プッシュトークン管理

### PUT /push-tokens

モバイルアプリの Expo Push Token をサーバに登録します。サイレントプッシュ通知によるタイマー即時同期に使用されます。

**認証**: Cognito JWT 必須

**リクエストボディ**

```json
{
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `pushToken` | string | Expo Push Token（`expo-notifications` で取得） |

**レスポンス**

```json
{ "ok": true }
```

**エラー**

| コード | 原因 |
|---|---|
| 400 | `pushToken` が未指定または文字列でない |
| 401 | 認証なし |

### DELETE /push-tokens

登録済みのプッシュトークンを削除します（ログアウト時に使用）。

**認証**: Cognito JWT 必須

**リクエストボディ**

```json
{
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

**レスポンス**

```json
{ "ok": true }
```

---

## トークン管理

### POST /tokens

通知トークンを新規発行します。**認証**: Cognito JWT 必須

### GET /tokens

発行済みトークンの一覧を返します。**認証**: Cognito JWT 必須

### DELETE /tokens/{token}

トークンを削除します。**認証**: Cognito JWT 必須

---

## エラーレポート

### POST /errors

クライアント（モバイルアプリ・poi プラグイン）からエラーログを送信します。認証不要。

**リクエストボディ**

```json
{
  "source": "mobile-app",
  "level": "error",
  "message": "Failed to sync timers",
  "stack": "Error: ...",
  "context": { "screen": "home" }
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `source` | string | `mobile-app` / `poi-plugin`（必須） |
| `level` | string | `error` / `warn`（デフォルト: `error`） |
| `message` | string | エラーメッセージ（必須、最大 1000 文字） |
| `stack` | string | スタックトレース（任意、最大 5000 文字） |
| `context` | object | 追加コンテキスト情報（任意） |

**レスポンス**: `{ "ok": true }`

**エラー**

| コード | 原因 |
|---|---|
| 400 | 不正な JSON、`source` / `level` / `message` が無効 |
| 413 | リクエストボディが 10KB を超過 |

### GET /errors

エラーログ一覧を取得します。**認証**: Cognito JWT 必須

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|---|---|---|
| `source` | string | `mobile-app` / `poi-plugin`（デフォルト: `mobile-app`） |
| `limit` | number | 取得件数（最大 200、デフォルト: 50） |
| `since` | string | この日時以降のログを取得（ISO 8601） |
| `cursor` | string | ページネーション用カーソル |

**レスポンス**

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

エラーログ閲覧用の HTML ダッシュボードを返します。認証不要（ダッシュボード内で Cognito OAuth ログインを実行）。

