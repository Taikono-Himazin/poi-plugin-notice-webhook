# AWS デプロイ手順書

## 前提条件

| ツール | 最低バージョン | 確認コマンド |
|--------|--------------|------------|
| Node.js | 20.x 以上 | `node -v` |
| AWS CLI | 2.x 以上 | `aws --version` |
| AWS CDK | 2.x 以上 (npm でインストール) | `npx cdk --version` |
| PAY.JP アカウント | 本番 or テスト | — |

---

## STEP 1 : AWS プロファイルを作成する

### 1-1. IAM ユーザーを作成する

AWS コンソール → IAM → ユーザー → 「ユーザーを作成」

- ユーザー名: `poi-webhook-deploy` (任意)
- 権限ポリシー: `AdministratorAccess`（初回のみ。後で絞り込み可）
- アクセスキーを発行してメモする

### 1-2. AWS CLI にプロファイルを登録する

```bash
aws configure --profile poi-webhook
```

```
AWS Access Key ID     : AKIA...
AWS Secret Access Key : xxxxxxxx
Default region name   : ap-northeast-1   ← リージョンを指定
Default output format : json
```

### 1-3. 認証確認

```bash
aws sts get-caller-identity --profile poi-webhook --region ap-northeast-1
```

Account / Arn が表示されれば OK。

---

## STEP 2 : PAY.JP を準備する

### 2-1. PAY.JP アカウント

https://pay.jp/ でアカウントを作成またはログイン。

### 2-2. プランを作成する

1. ダッシュボード → **プラン** → 「プランを作成」
2. プラン名: `poi 通知Webhook プレミアム`
3. 金額: `100` 円 / 月 (定期)
4. 作成後、**プラン ID** (`pln_...`) をメモする

### 2-3. API キーを取得する

ダッシュボード → **API** → **API キー**

- シークレットキー: `sk_live_...` (本番) / `sk_test_...` (テスト)
- 公開キー:         `pk_live_...` (本番) / `pk_test_...` (テスト)

> テスト段階では必ず `sk_test_...` / `pk_test_...` を使うこと。

### 2-4. Webhook 署名シークレットを取得する (デプロイ後)

> **注意:** デプロイして API URL が確定してから設定します。
> STEP 5 で説明します。

---

## STEP 3 : リポジトリのセットアップ

```bash
# aws/ ディレクトリに移動
cd path/to/poi-plugin-notice-webhook/aws

# 依存パッケージをインストール
npm install
```

---

## STEP 4 : デプロイを実行する

### Bash (macOS / Linux / WSL / Git Bash)

```bash
cd aws/scripts

./deploy.sh \
  --profile poi-webhook \
  --region  ap-northeast-1
```

スクリプトが起動すると PAY.JP キーの入力を求められます。

```
PAY.JP シークレットキー (sk_live_... / sk_test_...): <入力>
PAY.JP 公開キー (pk_live_... / pk_test_...): <入力>
PAY.JP Webhook 署名シークレット (デプロイ後に設定可): <空でも可>
PAY.JP プラン ID (pln_...): <入力>
```

### PowerShell (Windows)

```powershell
cd aws\scripts

.\deploy.ps1 `
  -Profile poi-webhook `
  -Region  ap-northeast-1
```

### 環境変数で PAY.JP キーを渡す場合 (CI/CD 向け)

```bash
export PAYJP_SECRET_KEY="sk_test_..."
export PAYJP_PUBLIC_KEY="pk_test_..."
export PAYJP_WEBHOOK_SECRET=""        # デプロイ後に再設定
export PAYJP_PLAN_ID="pln_..."

./deploy.sh --profile poi-webhook --region ap-northeast-1
```

### よく使うオプション

| オプション | 説明 |
|-----------|------|
| `--skip-bootstrap` | CDK Bootstrap 済みの場合にスキップ |
| `--dry-run` | `cdk synth` のみ実行。実際にはデプロイしない |

---

## STEP 5 : デプロイ後の設定

デプロイが完了すると以下が出力されます。

```
  ApiUrl           = https://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/v1/
  UserPoolId       = ap-northeast-1_XXXXXXXXX
  UserPoolClientId = xxxxxxxxxxxxxxxxxxxxxxxxxx
  IngestEndpoint   = https://xxxxxxxx.../v1/webhooks/{token}
  PayjpWebhookUrl  = https://xxxxxxxx.../v1/payjp/webhook
```

### 5-1. PAY.JP に Webhook URL を登録する

1. PAY.JP ダッシュボード → **Webhook**
2. 「Webhook を追加」
3. Webhook URL:
   ```
   https://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/v1/payjp/webhook
   ```
4. リッスンするイベントを選択:
   - `subscription.created`
   - `subscription.updated`
   - `subscription.deleted`
   - `charge.failed`
5. 作成後に表示される **署名シークレット** をメモする

### 5-2. PAY.JP Webhook シークレットをスタックに反映する

STEP 4 のデプロイ時に空で入力した場合は再デプロイします。

```bash
PAYJP_WEBHOOK_SECRET="<取得したシークレット>" \
./deploy.sh \
  --profile poi-webhook \
  --region  ap-northeast-1 \
  --skip-bootstrap
```

---

## STEP 6 : 動作確認

### 6-1. ユーザー登録 & トークン取得 (API テスト)

Cognito でユーザーを作成し JWT トークンを取得してから、
`/tokens` エンドポイントで Webhook トークンを発行します。

```bash
API_URL="https://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/v1"

# トークン作成 (Authorization ヘッダーに Cognito JWT を付与)
curl -s -X POST "${API_URL}/tokens" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"type": "discord", "url": "https://discord.com/api/webhooks/..."}' \
  | jq .
```

レスポンス例:
```json
{
  "token": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "webhookUrl": "https://...amazonaws.com/v1/webhooks/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

### 6-2. poi プラグインに登録する

1. poi を起動
2. 「通知転送」プラグインの設定パネルを開く
3. 送信形式: **Generic** を選択
4. Webhook URL: `https://...amazonaws.com/v1/webhooks/<token>` を入力
5. 「保存」をクリック
6. 「テスト送信」で動作確認

---

## STEP 7 : 削除する (スタック破棄)

```bash
# bash
AWS_PROFILE=poi-webhook npx cdk destroy PoiWebhookStack \
  --profile poi-webhook \
  --region  ap-northeast-1

# PowerShell
$env:AWS_PROFILE="poi-webhook"
npx cdk destroy PoiWebhookStack --profile poi-webhook --region ap-northeast-1
```

> DynamoDB テーブルは `RETAIN` ポリシーのためスタック削除後も残ります。
> 完全に削除する場合は AWS コンソールから手動で削除してください。

---

## トラブルシューティング

### `CDK Bootstrap` が失敗する

```
Error: This stack uses assets, so the toolkit stack must be deployed
```

→ `--skip-bootstrap` を外して再実行してください。

### `Lambda function not found` エラー

→ `npm install` が `aws/` ディレクトリで実行されているか確認してください。

### PAY.JP Webhook の署名検証エラー (400)

→ PAY.JP ダッシュボードの署名シークレットが正しいか確認し、
　`PAYJP_WEBHOOK_SECRET` を更新して再デプロイしてください。

### `NotAuthorized` / Cognito 認証エラー

→ JWT の有効期限切れ。再ログインして新しいトークンを取得してください。

---

## コスト目安 (月額)

| サービス | 目安 |
|---------|------|
| Lambda | 無料枠 (100万リクエスト/月) 以内なら **$0** |
| DynamoDB | オンデマンド、小規模なら **$0〜$1** |
| API Gateway | 100万リクエスト $3.50 (最初の100万は無料枠) |
| EventBridge Scheduler | 1400万呼び出し/月まで無料 |
| **合計** | 小規模なら **ほぼ $0** |
