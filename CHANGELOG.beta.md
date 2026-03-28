# CHANGELOG (Beta)

バージョンアップ時に CHANGELOG.md へ統合する。

## Unreleased

### Added
- アカウント削除機能を追加 (DELETE /account)
  - Lambda: Cognito ユーザー削除 + DynamoDB 全テーブルのユーザーデータ一括削除
  - CDK: AccountDeleteFunction + API Gateway エンドポイント
  - モバイルアプリ: HomeScreen にアカウント削除ボタン (2段階確認ダイアログ付き)
