# poi-notice-webhook

艦これ(Kantai Collection)の通知をDiscord/Slackに配信するシステム。

## Architecture

- **src/**: poiブラウザプラグイン (ES6 module, `index.es`)
- **aws/**: AWS CDK v2サーバーレス基盤 (Lambda Node.js 20, DynamoDB, API Gateway, Cognito)
- **mobile-app/**: Expo 54 React Native アプリ (React 19, RN 0.81)

## Commands

```bash
# AWS
cd aws && npm ci && npm run build && npm test
npx cdk diff / npx cdk deploy

# Mobile App
cd mobile-app && npm ci --legacy-peer-deps && npm test
npx expo start

# Plugin
cd src && npx jest --verbose

# Lint & Format (root)
npm run lint          # ESLint チェック
npm run lint:fix      # ESLint 自動修正
npm run format        # Prettier 自動整形
npm run format:check  # Prettier チェックのみ

# CI (GitHub Actions)
# aws, src, mobile-app それぞれ jest --verbose --coverage
```

## Conventions

### 言語・モジュール形式
- aws/lib/: TypeScript (CDK stack)
- aws/src/: CommonJS JavaScript (Lambda handlers), `'use strict';` 必須
- mobile-app/: TypeScript/TSX, ESM
- src/: ES6 JavaScript (.es extension)

### コードスタイル (Prettier + ESLint で自動適用)
- セミコロン: あり
- クォート: シングルクォート
- インデント: スペース 2
- 行幅上限: 120 文字
- 末尾カンマ: all (ES2017+)
- アロー関数の括弧: 常にあり `(x) => x`
- 改行コード: LF
- VSCode 保存時に自動整形 (`.vscode/settings.json` で設定済み)

### API 設計
- async/await を使用、コールバックは使わない
- エラーレスポンスは JSON `{ error: "message" }` + HTTP status code
- 認証: Cognito JWT + Bearer token
- Lambda のレスポンスヘッダーには常に CORS を含める

## Key Files

- `aws/lib/poi-webhook-stack.ts` — CDK stack定義 (全インフラ)
- `aws/src/ingest/index.js` — Webhook受信エントリポイント
- `aws/src/shared/deliver.js` — 配信共通ロジック
- `mobile-app/src/lib/api.ts` — APIクライアント
- `mobile-app/src/lib/auth.ts` — OAuth/トークンリフレッシュ
- `src/index.es` — poiプラグインエントリ

## DynamoDB Tables

accounts, tokens, notifications, timers, errors, stats, push-tokens
- PK設計は `aws/lib/poi-webhook-stack.ts` を参照

## Branching & Release

- dev: 開発ブランチ
- main: リリースブランチ
- 変更は CHANGELOG.beta.md に記録、リリース時に CHANGELOG.md へ統合

## Workflow Rules

- 3ステップ以上の非自明なタスクはPlan Modeから開始すること
- 調査・検索タスクはサブエージェントに委譲し、メインコンテキストを保持すること
- Claudeが間違えたパターンがあれば、このファイルに追記して再発を防ぐこと
