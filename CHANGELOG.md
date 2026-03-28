# CHANGELOG

## [1.1.0] - 2026-03-28

### Added
- アカウント削除機能を追加 (DELETE /account)
  - Lambda: Cognito ユーザー削除 + DynamoDB 全テーブルのユーザーデータ一括削除
  - CDK: AccountDeleteFunction + API Gateway エンドポイント
  - モバイルアプリ: HomeScreen にアカウント削除ボタン (2段階確認ダイアログ付き)
- サイレントプッシュ同期機能を追加
  - プッシュトークン管理 API (push-tokens)
  - タイマー同期時にサイレントプッシュ通知を送信
  - モバイルアプリにサイレントプッシュ受信・トークン登録機能を追加
- 通知タイミングを設定可能にする (notifyBeforeMinutes)
- EAS ビルド/提出・npm publish スクリプトを追加

### Fixed
- Android adaptive icon に余白を追加し拡大表示を修正
- スケジュール名のハッシュを MD5 から SHA-256 に変更

### Changed
- Prettier/ESLint による自動整形を設定し全ファイルに適用

### Docs
- モバイルアプリのドキュメントを追加
- サイレントプッシュ同期の設計書・API リファレンス・セットアップガイドを更新
- API ドキュメントの修正・補完
