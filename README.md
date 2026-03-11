# poi-notice-webhook

[poi](https://github.com/poooi/poi) 向け Webhook 通知プラグインです。遠征完了・入渠完了・建造完了などのゲームイベントを Discord / Slack / 任意の Webhook へ通知します。

**[ドキュメント](https://Taikono-Himazin.github.io/poi-notice-webhook/)**

## 特徴

- **直接配信モード** — poi が動作しているマシンから Webhook を直接送信（設定不要）
- **クラウド配信モード** — AWS Lambda 経由でクラウドから通知。poi を閉じていても配信可能
- Discord / Slack / 汎用 Webhook に対応
- 通知タイミングを完了 N 分前に調整可能（クラウドモード・有料）

## プラン

| | 無料プラン | 有料プラン |
|---|---|---|
| 直接配信 | OK | OK |
| クラウド配信 | 月 30 通まで | 無制限 |
| 遅延通知（N 分前） | - | OK |

有料プランは 1ヶ月 / 6ヶ月 / 12ヶ月の一回払い（PAY.JP）。

## クイックスタート

### 直接配信

1. poi にプラグインをインストール
2. 設定画面で「直接配信」を選択
3. Webhook URL を入力して保存

### クラウド配信

AWS へのデプロイが必要です。

```bash
cd aws/scripts
./deploy.sh --profile <AWS_PROFILE> --region ap-northeast-1
```

詳細は[セットアップガイド](https://Taikono-Himazin.github.io/poi-notice-webhook/setup)を参照してください。

## ディレクトリ構成

```
src/          poi プラグイン本体
aws/
  lib/        CDK スタック定義
  src/        Lambda 関数
    account/    アカウント設定
    billing/    PAY.JP 決済
    deliver/    遅延通知配信
    ingest/     通知受信
    payjp/      PAY.JP Webhook
    shared/     共通ロジック
    timers/     タイマー同期
    tokens/     トークン管理
  scripts/    デプロイスクリプト
doc/          ドキュメント（GitHub Pages）
```

## ライセンス

MIT
