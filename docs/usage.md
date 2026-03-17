---
layout: page
title: 使い方
nav_order: 2
---

[English](en/usage) \| [中文](zh/usage)

# 使い方

---

## 直接配信モード

poi が動作しているマシンから Webhook を直接送信します。追加の設定は不要です。

### 設定手順

1. poi の設定画面でプラグインを開く
2. **送信モード** で「直接送信」を選択
3. **Webhook の種類** を選択（Discord / Slack）
4. **Webhook URL** を入力
5. 「テスト送信」ボタンで動作確認
6. 「保存」ボタンで保存

### Webhook URL の取得方法

**Discord**

1. 通知を送りたいチャンネルの設定を開く
2. 「連携サービス」→「ウェブフック」→「新しいウェブフック」
3. 作成したウェブフックの URL をコピー（形式: `https://discord.com/api/webhooks/...`）

[公式ヘルプ](https://support.discord.com/hc/articles/228383668)

**Slack**

1. [Slack App を作成](https://api.slack.com/apps) し、Incoming Webhooks を有効化
2. チャンネルを選択して Webhook URL を取得（形式: `https://hooks.slack.com/services/...`）

[公式ヘルプ](https://api.slack.com/messaging/webhooks)

---

## クラウド配信モード

クラウドから通知を送信します。poi を閉じていても通知が届きます。

### ログイン

1. **送信モード** で「クラウド経由」を選択
2. 「ログイン」ボタンをクリック
3. メールアドレス・パスワードでアカウントを作成またはサインイン(Googleでのログインも可能です)

### Webhook の設定

ログイン後、Webhook の種類と URL を設定して保存します。設定はクラウドに保存され、通知はクラウドから送信されます。

### ログアウト

「ログアウト」ボタンをクリックするとサインアウトします。ログアウト時にスケジュール済みの通知はキャンセルされます。

---

## 通知のカラー

| 種類 | イベント | Discord | Slack |
|---|---|---|---|
| `expedition` | 遠征完了 | 青紫 `#5865F2` | 青紫 `#5865F2` |
| `repair` | 入渠完了 | 緑 `#57F287` | 緑 `#57F287` |
| `construction` | 建造完了 | 黄 `#FEE75C` | 黄 `#FEE75C` |

---

## テスト通知

設定画面の「テスト送信」ボタンで動作確認できます。実際のゲームイベントを待たずに Webhook の接続を確認するのに便利です。
