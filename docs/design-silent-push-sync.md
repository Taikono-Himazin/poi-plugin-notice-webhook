# サイレントプッシュ通知による即時同期

## 背景・課題

現在のモバイルアプリは `expo-background-task`（iOS: BGTaskScheduler）を使い、15 分間隔でサーバからタイマーを取得してローカル通知を再スケジュールしている。
しかし iOS はバッテリーやアプリ利用状況に応じてバックグラウンドタスクの実行タイミングを大幅に遅延・スキップするため、タイマー更新の即時反映が保証されない。

## 方針

poi プラグインがサーバへタイマーを同期（`PUT /timers`）したタイミングで、サーバからモバイルアプリへ **サイレントプッシュ通知** を送信する。
サイレントプッシュを受信したアプリは即座に同期処理を実行し、ローカル通知を再スケジュールする。

既存のバックグラウンドタスクはフォールバックとして残す。

---

## 全体フロー

```
poi プラグイン                   AWS                            モバイルアプリ
     |                           |                                   |
     |  PUT /timers              |                                   |
     |-------------------------->|                                   |
     |                           |  DynamoDB にタイマー保存           |
     |                           |  EventBridge Scheduler 作成       |
     |                           |                                   |
     |                           |  Expo Push API へ silent push    |
     |                           |---------------------------------->|
     |                           |                                   |
     |                           |                    onReceive で   |
     |                           |                    同期処理を実行  |
     |                           |                                   |
     |                           |  GET /timers                      |
     |                           |<----------------------------------|
     |                           |                                   |
     |                           |  タイマー一覧を返却                |
     |                           |---------------------------------->|
     |                           |                                   |
     |                           |                    ローカル通知    |
     |                           |                    再スケジュール   |
```

---

## 変更箇所

### 1. DynamoDB: プッシュトークンテーブル（新規）

| 項目 | 値 |
|------|-----|
| テーブル名 | `poi-webhook-push-tokens` |
| PK | `userId` (String) |
| SK | `pushToken` (String) |
| TTL | `ttl` |

同一ユーザが複数デバイスを持つケースに対応するため、userId + pushToken の複合キーとする。

```ts
// poi-webhook-stack.ts に追加
const pushTokensTable = new dynamodb.Table(this, 'PushTokensTable', {
  tableName: 'poi-webhook-push-tokens',
  partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
  sortKey:      { name: 'pushToken', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'ttl',
  removalPolicy: RemovalPolicy.RETAIN,
})
```

### 2. API: プッシュトークン登録エンドポイント（新規）

#### `PUT /push-tokens`（Cognito 認証）

モバイルアプリ起動時・トークン更新時に呼び出す。

**リクエスト:**
```json
{
  "pushToken": "ExponentPushToken[xxxxxx]"
}
```

**処理:**
1. userId + pushToken を DynamoDB に保存（TTL: 90 日）
2. 同一 userId の古いトークンが自然に TTL で消えるため、明示的な削除は不要

**Lambda:** `aws/src/push-tokens/register.js`

```js
exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub
  if (!userId) return err(401, 'Unauthorized')

  const { pushToken } = JSON.parse(event.body || '{}')
  if (!pushToken) return err(400, 'pushToken is required')

  await dynamo.send(new PutCommand({
    TableName: process.env.PUSH_TOKENS_TABLE,
    Item: {
      userId,
      pushToken,
      updatedAt: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + 90 * 86400,
    },
  }))

  return ok({ ok: true })
}
```

#### `DELETE /push-tokens`（Cognito 認証）

ログアウト時にトークンを削除する。

**リクエスト:**
```json
{
  "pushToken": "ExponentPushToken[xxxxxx]"
}
```

### 3. タイマー同期 Lambda の変更（`aws/src/timers/sync.js`）

タイマー保存後、そのユーザのプッシュトークンを取得し、サイレントプッシュを送信する。

```js
// タイマー保存処理の後に追加

// ---- サイレントプッシュ送信 ----
const pushTokensRes = await dynamo.send(new QueryCommand({
  TableName: process.env.PUSH_TOKENS_TABLE,
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: { ':uid': userId },
}))

const pushTokens = (pushTokensRes.Items || []).map(item => item.pushToken)

if (pushTokens.length > 0) {
  const messages = pushTokens.map(token => ({
    to: token,
    sound: null,          // サイレント
    priority: 'high',     // iOS: 即座に配信
    _contentAvailable: true,  // iOS: content-available = 1
    data: { type: 'timer-sync' },
    // title, body を省略 → ユーザに見える通知は出ない
  }))

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  })
}
```

**要点:**
- `_contentAvailable: true` → iOS の `content-available: 1` に変換され、バックグラウンドでアプリが起動される
- `priority: 'high'` → 即座に配信（iOS: apns-priority 10）
- `title` / `body` を省略 → 通知センターには何も表示されない
- Expo Push API は認証不要（トークン自体が認証）
- 送信失敗はタイマー同期自体の失敗にしない（fire-and-forget）

### 4. モバイルアプリ: プッシュトークン登録

#### `mobile-app/src/lib/pushToken.ts`（新規）

```ts
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import axios from 'axios'

export async function registerPushToken(apiUrl: string, jwt: string): Promise<string | null> {
  // Android はチャンネル設定が必要
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('silent', {
      name: 'Silent sync',
      importance: Notifications.AndroidImportance.MIN,
      sound: null,
    })
  }

  const { status } = await Notifications.getPermissionsAsync()
  if (status !== 'granted') return null

  const { data: pushToken } = await Notifications.getExpoPushTokenAsync()

  await axios.put(`${apiUrl}/push-tokens`, { pushToken }, {
    headers: { Authorization: `Bearer ${jwt}` },
    timeout: 10_000,
  })

  return pushToken
}
```

**呼び出しタイミング:**
- ログイン成功後
- アプリ起動時（フォアグラウンド復帰時）

### 5. モバイルアプリ: サイレントプッシュ受信ハンドラ

#### `mobile-app/src/lib/backgroundSync.ts` に追加

```ts
import * as Notifications from 'expo-notifications'

// サイレントプッシュ受信時の処理
Notifications.addNotificationResponseReceivedListener(/* 既存のまま */)

// バックグラウンドでの通知受信（サイレントプッシュ含む）
Notifications.registerTaskAsync('poi-notice-background-notification')
```

ただし、Expo の `expo-notifications` はサイレントプッシュのバックグラウンド受信に `expo-task-manager` と `Notifications.registerTaskAsync` を組み合わせる。

```ts
import * as TaskManager from 'expo-task-manager'

export const BACKGROUND_NOTIFICATION_TASK = 'poi-notice-background-notification'

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data }) => {
  const notification = data as { data?: { type?: string } }

  if (notification?.data?.type !== 'timer-sync') return

  // 既存の同期ロジックを再利用
  try {
    let jwt: string | null = null
    const isValid = await Storage.isJwtValid()
    if (isValid) {
      jwt = await Storage.getJwt()
    } else {
      jwt = await refreshTokens()
    }

    const config = await Storage.getAuthConfig()
    if (!jwt || !config) return

    const timers   = await fetchTimers(config.apiUrl, jwt)
    const settings = await Storage.getNotifySettings()

    await Promise.all([
      Storage.setTimersCache(timers),
      Storage.setLastSync(Date.now()),
      scheduleTimerNotifications(timers, settings),
    ])
  } catch {
    // サイレントに失敗 — 次回のバックグラウンドタスクでリトライ
  }
})

// App.tsx の初期化で呼び出す
export async function registerBackgroundNotificationTask(): Promise<void> {
  await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK)
}
```

### 6. CDK スタック変更まとめ

| 変更 | 内容 |
|------|------|
| テーブル追加 | `poi-webhook-push-tokens` |
| Lambda 追加 | `push-tokens/register.js`, `push-tokens/delete.js` |
| Lambda 変更 | `timers/sync.js` にサイレントプッシュ送信を追加 |
| API Gateway | `PUT /push-tokens`, `DELETE /push-tokens`（Cognito 認証） |
| 環境変数 | `PUSH_TOKENS_TABLE` を sync Lambda に追加 |
| IAM | sync Lambda に `PUSH_TOKENS_TABLE` の読み取り権限 |

---

## iOS アプリ設定の変更

現状の `UIBackgroundModes` には `fetch` のみ設定されている。
サイレントプッシュの受信には **`remote-notification`** の追加が必要。

### `app.config.js` の変更

```js
ios: {
  // ...
  infoPlist: {
    UIBackgroundModes: ['fetch', 'remote-notification'],  // ← 追加
    ITSAppUsesNonExemptEncryption: false,
  },
},
```

### `app.json` の変更（同様）

```json
"UIBackgroundModes": ["fetch", "remote-notification"]
```

### 影響

- `remote-notification` は Apple の審査で特別な説明は不要（標準的な Background Mode）
- ただしこの変更を含むビルドは **EAS Build で再ビルド → App Store への再提出** が必要
- TestFlight での事前検証を推奨

---

## iOS 制約と対策

| 制約 | 対策 |
|------|------|
| サイレントプッシュは `content-available` が必要 | Expo の `_contentAvailable: true` で設定 |
| iOS はサイレントプッシュでアプリを起動するが、実行時間は約 30 秒 | 同期処理は軽量（API 1 回 + ローカル通知スケジュール）で十分収まる |
| iOS が連続するサイレントプッシュをスロットル | poi のタイマー同期は頻繁ではない（1 出撃ごとに 1 回程度）ので問題なし |
| Rate limit: 同じデバイスへ 2〜3 回/時を超えるとスロットルされうる | 通常の使用パターンでは問題なし |
| アプリが Force Quit されている場合、iOS はサイレントプッシュを配信しない | フォールバックとして既存のバックグラウンドタスク（15 分間隔）を残す |

---

## Android 対応

- Android は FCM データメッセージ（`data` のみ、`notification` なし）でバックグラウンド実行が可能
- Expo Push API が自動的に FCM 形式に変換
- Doze モードでは high priority メッセージでも遅延する可能性があるが、iOS より制約は少ない

---

## シーケンス（エッジケース）

### アプリ未インストール / プッシュ権限拒否

サイレントプッシュは送信されるが無視される。タイマーは正常に保存され、webhook 配信は影響を受けない。

### トークン失効（アプリ再インストール等）

Expo Push API が `DeviceNotRegistered` エラーを返した場合、該当トークンを DynamoDB から削除する。

```js
// sync.js でレスポンスをチェック
const res = await fetch('https://exp.host/--/api/v2/push/send', { ... })
const result = await res.json()

if (result.data) {
  for (let i = 0; i < result.data.length; i++) {
    if (result.data[i].status === 'error' &&
        result.data[i].details?.error === 'DeviceNotRegistered') {
      await dynamo.send(new DeleteCommand({
        TableName: process.env.PUSH_TOKENS_TABLE,
        Key: { userId, pushToken: pushTokens[i] },
      }))
    }
  }
}
```

### 複数デバイス

userId に対して複数の pushToken が登録されている場合、全デバイスにサイレントプッシュを送信する。Expo Push API はバッチ送信に対応している。

---

## 実装順序

1. **DynamoDB テーブル + CDK** — `poi-webhook-push-tokens` テーブルを追加
2. **プッシュトークン API** — `PUT /push-tokens`, `DELETE /push-tokens` Lambda + API Gateway
3. **モバイルアプリ: トークン登録** — ログイン後・起動時にトークンをサーバへ送信
4. **タイマー同期 Lambda** — サイレントプッシュ送信ロジックを追加
5. **モバイルアプリ: 受信ハンドラ** — サイレントプッシュ受信時に同期処理を実行
6. **テスト** — Expo Push Tool でサイレントプッシュ送信テスト → アプリのバックグラウンド同期確認

---

## 既存機能への影響

- `PUT /timers` のレスポンスに変更なし（プッシュ送信は fire-and-forget）
- 既存のバックグラウンドタスク（15 分間隔）はそのまま残す（フォールバック）
- webhook 配信（Discord / Slack / LINE）は影響なし
- Expo Push API の利用は無料（Expo のインフラ上で動作する Expo アプリが対象）
