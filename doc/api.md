---
layout: page
title: API リファレンス
nav_order: 4
---

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
  "type": "expedition",
  "deliverAfterMinutes": 0
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `message` | string | 通知メッセージ本文 |
| `title` | string | 通知タイトル |
| `type` | string | 通知種別（`expedition` / `repair` / `construction` / `default`） |
| `deliverAfterMinutes` | number | 配信遅延（分）。有料プランのみ有効。0 で即時配信 |

**レスポンス**

```json
{ "ok": true }
```

**エラー**

| コード | 原因 |
|---|---|
| 400 | トークン未指定、Webhook 未設定 |
| 404 | トークンが存在しない |
| 429 | 無料プランの月次制限（30通）超過 |

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
  }
}
```

`timers` が空配列の場合、既存のスケジュールをすべてキャンセルします（ログアウト時に使用）。

---

## アカウント設定

### GET /account/config

Webhook 設定を取得します。

**認証**: Cognito JWT 必須

**レスポンス**

```json
{
  "webhookType": "discord",
  "webhookUrl": "https://discord.com/api/webhooks/...",
  "deliverBeforeMinutes": 1
}
```

### PUT /account/config

Webhook 設定を更新します。

**認証**: Cognito JWT 必須

**リクエストボディ**

```json
{
  "webhookType": "discord",
  "webhookUrl": "https://discord.com/api/webhooks/...",
  "deliverBeforeMinutes": 1
}
```

---

## トークン管理

### POST /tokens

通知トークンを新規発行します。

**認証**: Cognito JWT 必須

**レスポンス**

```json
{ "token": "abc123..." }
```

### GET /tokens

発行済みトークンの一覧を返します。

**認証**: Cognito JWT 必須

### DELETE /tokens/{token}

トークンを削除します。

**認証**: Cognito JWT 必須

---

## 請求

### GET /billing/checkout?plan={plan}

PAY.JP v2 チェックアウトセッションを作成し、決済ページの URL を返します。

**認証**: Cognito JWT 必須

**クエリパラメータ**

| パラメータ | 値 | 説明 |
|---|---|---|
| `plan` | `1m` / `6m` / `12m` | 購入するプラン |

**レスポンス**

```json
{ "checkoutUrl": "https://c.pay.jp/..." }
```

### GET /billing/status

サブスクリプション状態を返します。

**認証**: Cognito JWT 必須

**レスポンス**

```json
{
  "plan": "paid",
  "subscriptionStatus": "active",
  "notificationCount": 12,
  "monthlyLimit": null,
  "paidUntil": 1740000000000,
  "hasSubscription": false
}
```

| フィールド | 説明 |
|---|---|
| `plan` | `"paid"` または `"free"` |
| `subscriptionStatus` | `"active"` / `"inactive"` / `"canceled"` / `"past_due"` |
| `notificationCount` | 今月の通知送信数 |
| `monthlyLimit` | 月次上限（無料: 30、有料: `null` = 無制限） |
| `paidUntil` | 有効期限（Unix ms）。`null` の場合は期限なし |
| `hasSubscription` | 旧サブスクリプション形式の有無 |

---

## PAY.JP Webhook

### POST /payjp/webhook

PAY.JP からのイベントを受信します。認証不要（Webhook トークンまたは HMAC-SHA256 署名で検証）。

サポートするイベント:

| イベント | 処理内容 |
|---|---|
| `checkout.session.completed` | 決済完了 — `paidUntil` を設定して有料プランを有効化 |
| `subscription.created` | サブスク開始（旧形式） |
| `subscription.updated` | サブスク状態変更（旧形式） |
| `subscription.deleted` | サブスクキャンセル（旧形式） |
| `charge.failed` | 課金失敗 — `past_due` に設定 |
