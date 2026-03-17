---
layout: page
title: 高度な使い方
nav_order: 4
---

# 高度な使い方（セルフホスト向け）

> **通常利用の方はこのページは不要です。**
> プラグインをインストールして「クラウド経由」を選択するだけで利用できます。
>
> このガイドは自前の AWS 環境にデプロイしたい開発者・事業者向けです。

クラウド配信モードを自前の AWS 環境で動かすには以下のデプロイ手順が必要です。

## 必要なもの

- AWS アカウント
- AWS CLI（プロファイル設定済み）
- Node.js 20 以上
- [PAY.JP](https://pay.jp/) アカウント（有料プランを提供する場合）

## 1. PAY.JP 設定

### 商品・価格 ID の作成

PAY.JP ダッシュボードで以下を作成します。

1. **商品** を作成（例: "通知転送プラグイン"）
2. **価格 (v2)** を 1ヶ月 / 6ヶ月 / 12ヶ月分それぞれ作成
   - 価格 ID は `price_...` の形式
3. **API キー** を取得
   - 公開キー: `pk_live_...` または `pk_test_...`
   - シークレットキー: `sk_live_...` または `sk_test_...`

### Webhook の登録（デプロイ後）

デプロイ完了後、PAY.JP ダッシュボードの **Webhook** メニューで以下を設定します。

- **URL**: `https://<API_ID>.execute-api.<REGION>.amazonaws.com/v1/payjp/webhook`
  （デプロイ後に `PayjpWebhookUrl` として出力されます）
- **イベント**: `checkout.session.completed`
- **認証トークン**: 任意の文字列（後ほど `PAYJP_WEBHOOK_SECRET` に設定）

## 2. Google ログイン設定（任意）

Google アカウントでのサインインを有効にする場合：

1. [Google Cloud Console](https://console.cloud.google.com/) で OAuth 2.0 クライアントを作成
2. **承認済みリダイレクト URI** に Cognito のコールバック URL を追加
   - 形式: `https://poi-webhook-<AWS_ACCOUNT>.auth.<REGION>.amazoncognito.com/oauth2/idpresponse`
3. クライアント ID とシークレットをメモ

## 3. デプロイ

```bash
cd aws/scripts
./deploy.sh --profile <AWS_PROFILE> --region ap-northeast-1
```

スクリプトが対話形式で以下を確認します。

| 変数 | 説明 |
|---|---|
| `PAYJP_SECRET_KEY` | PAY.JP シークレットキー |
| `PAYJP_PUBLIC_KEY` | PAY.JP 公開キー |
| `PAYJP_PRICE_1M` | 1ヶ月プランの価格 ID |
| `PAYJP_PRICE_6M` | 6ヶ月プランの価格 ID |
| `PAYJP_PRICE_12M` | 12ヶ月プランの価格 ID |
| `PAYJP_WEBHOOK_SECRET` | PAY.JP Webhook 認証トークン |
| `GOOGLE_CLIENT_ID` | Google OAuth クライアント ID（任意） |
| `GOOGLE_CLIENT_SECRET` | Google OAuth クライアントシークレット（任意） |

入力した値は `aws/.poi-webhook-deploy.env` に保存されます（`.gitignore` 済み）。次回以降は Enter でスキップできます。

### オプション

```bash
./deploy.sh --profile myprofile --region ap-northeast-1 --skip-bootstrap
```

| オプション | 説明 |
|---|---|
| `--skip-bootstrap` | CDK bootstrap をスキップ（既に実行済みの場合） |
| `--dry-run` | デプロイせず CloudFormation テンプレートの確認のみ |

## 4. デプロイ後の確認

デプロイ完了後、以下の値が出力されます。これらは `src/aws-outputs.json` にも保存され、プラグインが自動読み込みします。

| 出力 | 説明 |
|---|---|
| `ApiUrl` | API Gateway のベース URL |
| `UserPoolId` | Cognito ユーザープール ID |
| `UserPoolClientId` | Cognito クライアント ID |
| `CognitoDomain` | Cognito Managed Login のドメイン |
| `PayjpWebhookUrl` | PAY.JP に登録する Webhook URL |

## 構成される AWS リソース

```
API Gateway (REST)
├── POST   /webhooks/{token}       通知受信（認証不要）
├── PUT    /timers                 タイマー同期
├── GET    /account/config         アカウント設定取得
├── PUT    /account/config         アカウント設定更新
├── POST   /tokens                 トークン発行
├── GET    /tokens                 トークン一覧
├── DELETE /tokens/{token}         トークン削除
├── GET    /billing/checkout       PAY.JP チェックアウト URL 取得
├── GET    /billing/status         プラン状態確認
├── POST   /billing/trial          無料トライアル付与
├── GET    /billing/pay-complete   決済完了ページ
└── POST   /payjp/webhook          PAY.JP Webhook 受信

DynamoDB テーブル (4 テーブル)
├── poi-webhook-accounts      ユーザーアカウント・契約状態
├── poi-webhook-tokens        通知用トークン
├── poi-webhook-notifications 遅延配信キュー
└── poi-webhook-timers        タイマー状態

Cognito User Pool
└── Managed Login (メール認証 + Google OAuth オプション)

EventBridge Scheduler
└── 各タイマーの配信スケジュール
```

## 再デプロイ

設定を変更した場合は同じコマンドで再デプロイできます。

```bash
cd aws/scripts
./deploy.sh --profile <AWS_PROFILE> --region ap-northeast-1 --skip-bootstrap
```
