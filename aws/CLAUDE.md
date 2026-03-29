# aws/ — サーバーレス基盤 (CDK v2 + Lambda)

## Build & Test

```bash
npm ci && npm run build && npm test
npx cdk diff          # 差分確認
npx cdk deploy        # デプロイ (要確認)
```

## Conventions

- `aws/lib/`: TypeScript (CDK stack 定義)
- `aws/src/`: CommonJS JavaScript (Lambda handlers), 先頭に `'use strict';` 必須
- async/await を使用、コールバック禁止
- Lambda レスポンスには必ず CORS ヘッダーを含める
- エラーレスポンスは `{ error: "message" }` + 適切な HTTP status code

## DynamoDB PK 設計

| テーブル      | PK          | SK          | 備考                            |
| ------------- | ----------- | ----------- | ------------------------------- |
| accounts      | `userId`    | —           | Webhook設定・サブスクリプション |
| tokens        | `token`     | —           | GSI: `userId-index`             |
| notifications | `id` (UUID) | —           | TTL付き                         |
| timers        | `userId`    | `type#slot` | 遠征/入渠/建造、TTL付き         |
| errors        | `source`    | `timestamp` | TTL付き                         |
| stats         | `userId`    | `YYYY-MM`   | 月次通知カウント                |
| push-tokens   | `userId`    | `pushToken` | Expo push token、TTL付き        |

複合ソートキーは `type#slot` パターン（例: `expedition#2`, `repair#3`）

## Key Files

- `lib/poi-webhook-stack.ts` — 全インフラ定義
- `src/ingest/index.js` — Webhook 受信エントリポイント
- `src/shared/deliver.js` — 配信共通ロジック
- `src/timers/sync.js` — タイマー同期処理
