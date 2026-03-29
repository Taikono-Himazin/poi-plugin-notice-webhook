# CHANGELOG

## [1.2.0] - 2026-03-29

### Added

- EAS Update (OTA) に対応
  - 起動時にアップデートを自動チェックし、確認ダイアログで適用可能
  - デバッグ画面に手動アップデート確認ボタンを追加
  - app.config.js に runtimeVersion / updates URL を設定
  - eas-publish.sh に --ota-only / --ota-message オプションを追加
- デバッグ画面にバージョン情報セクションを追加 (アプリ版・ランタイム版・Update ID・チャンネル)
- デバッグ画面をログイン前でも開けるよう LoginScreen にボタンを追加
- iOS ウィジェットを大幅強化
  - 進捗バー・タイプアイコン・残り時間フォーマットを追加
  - 完了済みタイマーもウィジェット上で 00:00 表示し続けるよう変更
  - Timer に durationSeconds フィールドを追加
  - ウィジェットプレビュー HTML を追加
- app.json を app.config.js に移行し、iOS ダークアイコン・Apple Sign-In に対応
- deploy.sh を刷新 (JSON 設定保存・Apple Sign In・フェデレーション制限設定に対応)
- npm-publish.sh / test.sh スクリプトを新規追加
- devcontainer に AWS CLI / CDK / Docker を追加
- aws/ ディレクトリに README とサードパーティライセンスを追加

### Fixed

- サイレントプッシュのペイロード構造を修正 (data.data.type → data.notification.request.content.data.type)
  - デバッグビューに Push が表示されない不具合を修正
- ログイン失敗時にエラー種別 (dismissed, error 等) やトークン交換エラーの詳細を表示するよう改善
- サイレントプッシュの送信ログ (トークン数・Expo API レスポンス・エラー詳細) を追加
- Lambda バンドリングの forceDockerBundling を削除
- expo-build-properties のバージョンを ~1.0.10 に修正
- EAS ビルドイメージを macos-sequoia-15.3-xcode-16.2 に固定
- アプリビルド時の不具合を修正 (eas.json・withWidget プラグイン・ウィジェットモジュール)
- esbuild を 0.25.12 に更新

### Changed

- HomeScreen のタイマー一覧を完了済みも含め全件表示するよう変更
- VSCode 推奨拡張に Git Graph・日本語パック・Live Server・Markdown PDF・Claude Code を追加

### Docs

- モバイルアプリページを新規作成 (ウィジェット機能・ロック画面ウィジェット解説)
- usage.md のウィジェットセクションをロック画面対応に更新
- Mermaid 図を draw.io SVG に置き換え、設計ドキュメントを整理
- スクリーンショット・構成図・エンドポイント一覧テーブルを追加

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
