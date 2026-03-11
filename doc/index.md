---
layout: home
title: poi-plugin-notice-webhook
nav_order: 1
---

# poi-plugin-notice-webhook

[poi](https://github.com/poooi/poi) 向け Webhook 通知プラグインです。遠征完了・入渠完了・建造完了などのゲームイベントを Discord / Slack / 任意の Webhook へ通知します。

## 特徴

- **直接配信モード** — poi が動作しているマシンから Webhook を直接送信
- **クラウド配信モード (PREMIUM)** — AWS Lambda 経由でクラウドから通知。poi を閉じていても配信可能
- Discord / Slack / 汎用 Webhook に対応
- 通知タイミングを完了 N 分前に調整可能（クラウドモード）

## プラン

| | 無料プラン | 有料プラン |
|---|---|---|
| 直接配信 | OK | OK |
| クラウド配信 | 月 30 通まで | 無制限 |
| 遅延通知（N 分前） | - | OK |
| 価格 | 無料 | 100円〜 |

有料プランは 1ヶ月 / 6ヶ月 / 12ヶ月の一回払いで、PAY.JP によるカード決済に対応しています。

## クイックスタート

### 直接配信モード（設定不要）

1. poi にプラグインをインストール
2. 設定画面で「直接配信」を選択
3. Webhook URL を入力して保存
4. テスト通知を送って確認

### クラウド配信モード

AWS へのデプロイが必要です。[セットアップガイド](setup.md) を参照してください。

## 通知内容

通知されるゲームイベント：

| イベント | 内容 |
|---|---|
| 遠征完了 | 遠征完了の 1 分前に通知 |
| 入渠完了 | 入渠完了の 1 分前に通知 |
| 建造完了 | 建造完了の 1 分前に通知 |

## ソースコード

[GitHub リポジトリ](https://github.com/Taikono-Himazin/poi-plugin-notice-webhook) — MIT License
