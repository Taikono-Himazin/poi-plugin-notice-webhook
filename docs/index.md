---
layout: home
title: ホーム
nav_order: 1
---

[English](en/) \| [中文](zh/)

# 通知転送（poiプラグイン）

[poi](https://github.com/poooi/poi) 向け Webhook 通知プラグインです。遠征完了・入渠完了・建造完了などのゲームイベントを Discord / Slack へ通知します。

## 特徴

- **直接配信モード** — poi が動作しているマシンから Webhook を直接送信
- **クラウド配信モード** — クラウドから通知。poi を閉じていても配信可能
- Discord / Slack に対応

## プラン

| | 無料プラン | 有料プラン |
|---|---|---|
| 直接配信 | OK | OK |
| クラウド配信 | NG |OK |

有料プランは 1ヶ月 / 6ヶ月 / 12ヶ月の一回払い。有効期限が残っている間に再購入すると残り期間から延長されます。

## クイックスタート

### 直接配信（設定不要）

1. poi にプラグインをインストール
2. 設定画面で「直接配信」を選択
3. Webhook URL を入力して保存(Webhook URLの取得方法は下を参照)

### クラウド配信（DENTANプラン）

1. poi にプラグインをインストール
2. 設定画面で「クラウド経由」を選択
3. 「ログイン」ボタンからアカウントを作成してサインイン
4. Webhook URL を入力して保存(Webhook URLの取得方法は下を参照)

**Webhook URL の取得方法**

- **Discord** — チャンネル設定 →「連携サービス」→「ウェブフック」→「新しいウェブフック」で URL を作成（[公式ヘルプ](https://support.discord.com/hc/articles/228383668)）
- **Slack** — [Slack App](https://api.slack.com/apps) で Incoming Webhooks を有効化してチャンネルを選択（[公式ヘルプ](https://api.slack.com/messaging/webhooks)）


## 通知内容

| イベント | タイミング |
|---|---|
| 遠征完了 | 完了時（または直前） |
| 入渠完了 | 完了時（または直前） |
| 建造完了 | 完了時（または直前） |

## ソースコード

[GitHub リポジトリ](https://github.com/Taikono-Himazin/poi-plugin-notice-webhook) — MIT License

---

<small>[プライバシーポリシー](privacy) / [利用規約](terms) / [特定商取引法に基づく表記](tokushoho)</small>
