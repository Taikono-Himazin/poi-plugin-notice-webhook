# poi-notice-webhook サービス利用手順書

デプロイ後の AWS サービスを利用する手順です。
デプロイ自体は [DEPLOY.md](DEPLOY.md) を参照してください。

---

## 事前準備

デプロイ完了後に CloudFormation の Outputs から以下の値を控えておきます。

```bash
aws cloudformation describe-stacks \
  --stack-name PoiWebhookStack \
  --profile <your-profile> \
  --region  ap-northeast-1 \
  --query   "Stacks[0].Outputs" \
  --output  table
```

| Output キー | 用途 |
|------------|------|
| `ApiUrl` | API のベース URL |
| `UserPoolId` | Cognito ユーザープール ID |
| `UserPoolClientId` | 認証に使うクライアント ID |
| `PayjpWebhookUrl` | PAY.JP ダッシュボードに登録する URL |

以降のコマンド例では次の変数を設定済みとして記述します。

```bash
API_URL="https://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/v1"
USER_POOL_CLIENT_ID="xxxxxxxxxxxxxxxxxxxxxxxxxx"
REGION="ap-northeast-1"
```

---

## STEP 1 : ユーザー登録

### 1-1. サインアップ

```bash
aws cognito-idp sign-up \
  --client-id  "$USER_POOL_CLIENT_ID" \
  --username   "your@email.com" \
  --password   "Password1" \
  --region     "$REGION"
```

成功すると確認メールが届きます。

### 1-2. メール認証

メールに記載された 6 桁のコードで認証を完了します。

```bash
aws cognito-idp confirm-sign-up \
  --client-id        "$USER_POOL_CLIENT_ID" \
  --username         "your@email.com" \
  --confirmation-code "123456" \
  --region           "$REGION"
```

---

## STEP 2 : ログイン (JWT トークン取得)

```bash
AUTH_RESULT=$(aws cognito-idp initiate-auth \
  --client-id    "$USER_POOL_CLIENT_ID" \
  --auth-flow    USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="your@email.com",PASSWORD="Password1" \
  --region       "$REGION" \
  --output json)

JWT=$(echo "$AUTH_RESULT" | grep -o '"IdToken": *"[^"]*"' | cut -d'"' -f4)
echo "JWT: ${JWT:0:40}..."
```

> JWT の有効期限は **1 時間** です。期限切れの場合は再実行してください。

---

## STEP 3 : Webhook トークンを発行する

### 3-1. 対応している通知タイプ

| type | 送信先 | 必要なパラメータ |
|------|--------|----------------|
| `generic` | 汎用 JSON Webhook | `url` |
| `discord` | Discord Webhook | `url` |
| `slack` | Slack Incoming Webhook | `url` |
| `line` | LINE Notify | `lineToken` |

### 3-2. トークン作成 (例: Discord)

```bash
curl -s -X POST "${API_URL}/tokens" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "discord",
    "url":  "https://discord.com/api/webhooks/xxxx/yyyy"
  }' | jq .
```

レスポンス例:
```json
{
  "token":      "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "webhookUrl": "https://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/v1/webhooks/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

### 3-3. トークン作成 (例: LINE Notify)

```bash
curl -s -X POST "${API_URL}/tokens" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "type":      "line",
    "lineToken": "xxxxxxxxxxxxxxxxxxxx"
  }' | jq .
```

### 3-4. 発行済みトークン一覧

```bash
curl -s -X GET "${API_URL}/tokens" \
  -H "Authorization: Bearer ${JWT}" | jq .
```

### 3-5. トークン削除

```bash
curl -s -X DELETE "${API_URL}/tokens/<token>" \
  -H "Authorization: Bearer ${JWT}"
```

> **プランごとのトークン上限**
> | プラン | 上限 |
> |--------|------|
> | 無料 | 1 個 |
> | 有料 | 10 個 |

---

## STEP 4 : poi プラグインに Webhook URL を登録する

1. poi を起動する
2. 「通知転送」プラグインの設定パネルを開く
3. **送信形式** で `Generic` / `Discord` / `Slack` / `LINE Notify` を選択
4. **Webhook URL** に STEP 3 で取得した `webhookUrl` を入力
5. 「保存」→「テスト送信」で動作確認

---

## STEP 5 : サブスクリプション (有料プラン)

有料プラン (月額 100 円) に加入すると以下が解放されます。

| 機能 | 無料 | 有料 |
|------|------|------|
| 月間通知数 | 30 件 | 無制限 |
| トークン数 | 1 個 | 10 個 |
| 遅延配信 | - | 最大 24 時間後 |

### 5-1. 支払い情報を取得 (公開鍵・プラン ID)

```bash
curl -s -X GET "${API_URL}/billing/checkout" \
  -H "Authorization: Bearer ${JWT}" | jq .
```

レスポンス例:
```json
{
  "publicKey":         "pk_test_xxxxxxxxxxxx",
  "planId":            "pln_xxxxxxxxxxxx",
  "amount":            100,
  "currency":          "jpy",
  "alreadySubscribed": false
}
```

### 5-2. カードトークンを生成する

フロントエンドで `payjp.js` を使ってカード情報をトークン化します。
CLI テスト目的であれば PAY.JP のテストカード番号を使用できます。

```html
<!-- payjp.js を組み込んだ HTML から実行 -->
<script src="https://js.pay.jp/v2/pay.js"></script>
<script>
const payjp = Payjp("pk_test_xxxxxxxxxxxx")  // publicKey を使用
payjp.createToken(cardElement).then(result => {
  console.log(result.id)  // tok_xxxx — これを API に送る
})
</script>
```

> PAY.JP テストカード番号: `4242 4242 4242 4242` / 有効期限: 任意の未来日 / CVC: 任意

### 5-3. サブスクリプション登録

```bash
curl -s -X POST "${API_URL}/billing/subscribe" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json" \
  -d '{"cardToken": "tok_xxxxxxxxxxxxxxxx"}' | jq .
```

レスポンス例:
```json
{
  "subscriptionId": "sub_xxxxxxxxxxxx",
  "status": "active"
}
```

### 5-4. サブスクリプション状態を確認する

```bash
curl -s -X GET "${API_URL}/billing/status" \
  -H "Authorization: Bearer ${JWT}" | jq .
```

レスポンス例:
```json
{
  "plan":               "paid",
  "subscriptionStatus": "active",
  "notificationCount":  5,
  "monthlyLimit":       null
}
```

`subscriptionStatus` の値:

| 値 | 意味 |
|----|------|
| `inactive` | 未加入 |
| `active` | 有効 |
| `canceled` | キャンセル済み (期末まで有効) |
| `past_due` | 支払い失敗 |

### 5-5. サブスクリプションをキャンセルする

```bash
curl -s -X DELETE "${API_URL}/billing/subscription" \
  -H "Authorization: Bearer ${JWT}" | jq .
```

キャンセルは**即時ではなく次回更新日に停止**されます。
それまでの期間は引き続き有料プランの機能を利用できます。

---

## STEP 6 : 遅延配信を使う (有料プランのみ)

poi プラグインの設定で `delayMinutes` を指定すると、
指定時間後に通知が配信されます。

Webhook ペイロードの例 (generic 形式で遅延配信):

```json
{
  "title":               "出撃完了",
  "body":                "第一艦隊が帰投します",
  "deliverAfterMinutes": 120
}
```

> 有効範囲: 1 〜 1440 分 (最大 24 時間)
> 無料プランでは `deliverAfterMinutes` は無視されます。

---

## API エンドポイント一覧

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| `POST` | `/webhooks/{token}` | 不要 | 通知を受信・配信 |
| `POST` | `/tokens` | Cognito | トークン作成 |
| `GET` | `/tokens` | Cognito | トークン一覧 |
| `DELETE` | `/tokens/{token}` | Cognito | トークン削除 |
| `GET` | `/billing/checkout` | Cognito | 支払い情報取得 |
| `POST` | `/billing/subscribe` | Cognito | サブスク登録 |
| `DELETE` | `/billing/subscription` | Cognito | サブスクキャンセル |
| `GET` | `/billing/status` | Cognito | サブスク状態確認 |
| `POST` | `/payjp/webhook` | 不要 (署名検証) | PAY.JP Webhook 受信 |

---

## トラブルシューティング

### JWT が `401 Unauthorized` になる

JWT の有効期限 (1 時間) が切れています。[STEP 2](#step-2--ログイン-jwt-トークン取得) を再実行してください。

### トークン作成が `403 Token limit reached` になる

無料プランのトークン上限 (1 個) に達しています。
既存トークンを削除するか、有料プランに加入してください。

### 通知が届かない

1. `GET /tokens` でトークンの `url` が正しいか確認する
2. poi プラグインの「テスト送信」で `200 OK` が返るか確認する
3. Discord / Slack 側の Webhook URL が有効か確認する

### `402 Payment failed` になる

PAY.JP のカードトークン (`tok_...`) が期限切れか無効です。
`payjp.js` で再度トークンを生成してから送信してください。
