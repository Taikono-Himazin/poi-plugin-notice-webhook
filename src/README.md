# poi-plugin-notice-webhook

[![npm](https://img.shields.io/npm/v/poi-plugin-notice-webhook)](https://www.npmjs.com/package/poi-plugin-notice-webhook)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/Taikono-Himazin?label=Sponsor&logo=GitHub)](https://github.com/sponsors/Taikono-Himazin)

[poi](https://github.com/poooi/poi) 向け通知転送プラグインです。
遠征・入渠・建造の完了を **Discord / Slack** へ Webhook で通知します。

---

## 特徴

- 遠征・入渠・建造の完了を Discord または Slack へ通知
- **直接送信モード** — poi 起動中に Webhook を直接送信（設定不要）
- **クラウド経由モード** — AWS バックエンド経由で poi を閉じていても通知が届く
- 完了 **1分前** に通知を受け取れる
- Discord / Slack に対応

## インストール

poi のプラグイン管理画面から `poi-plugin-notice-webhook` を検索してインストールしてください。

## 使い方

### 直接送信モード

1. プラグインの設定画面を開く
2. 送信モードを「直接送信」に選択
3. Discord または Slack の Webhook URL を入力して保存
4. 「テスト送信」で動作確認

**Webhook URL の取得方法**

- **Discord** — チャンネル設定 → 連携サービス → ウェブフック → 新しいウェブフック（[公式ヘルプ](https://support.discord.com/hc/articles/228383668)）
- **Slack** — Slack App の Incoming Webhooks を有効化（[公式ヘルプ](https://api.slack.com/messaging/webhooks)）

### クラウド経由モード

poi を閉じていても通知を受け取れます。AWS へのセルフホスト デプロイが必要です。
詳細は [GitHub リポジトリ](https://github.com/Taikono-Himazin/poi-plugin-notice-webhook) を参照してください。

## ライセンス

MIT

## サポート

このプラグインは**完全無料・オープンソース**です。支援の有無で機能差はありません。
もしよろしければ [GitHub Sponsors](https://github.com/sponsors/Taikono-Himazin) からご支援をお願いします。
