import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'
import { Storage } from './storage'
import { refreshTokens } from './auth'
import { fetchTimers } from './api'
import { scheduleTimerNotifications } from './notifications'

export const BACKGROUND_SYNC_TASK = 'poi-notice-background-sync'

// ---- タスク定義（モジュール読み込み時に登録される）----
// App.tsx で import されることで定義が確実に実行される。
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    let jwt: string | null = null

    const isValid = await Storage.isJwtValid()
    if (isValid) {
      jwt = await Storage.getJwt()
    } else {
      // トークン期限切れ → refreshToken でサイレントリフレッシュ
      jwt = await refreshTokens()
    }

    const config = await Storage.getAuthConfig()
    if (!jwt || !config) return BackgroundTask.BackgroundTaskResult.NoData

    const timers   = await fetchTimers(config.apiUrl, jwt)
    const settings = await Storage.getNotifySettings()

    await Promise.all([
      Storage.setTimersCache(timers),
      Storage.setLastSync(Date.now()),
      scheduleTimerNotifications(timers, settings),
    ])

    return BackgroundTask.BackgroundTaskResult.Success
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

// ---- タスク登録 ----
export async function registerBackgroundSync(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)
  if (isRegistered) return

  await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
    minimumInterval: 15 * 60, // 15分（iOS は OS の判断で実行タイミングが変動する）
  })
}

export async function unregisterBackgroundSync(): Promise<void> {
  await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK).catch(() => {})
}
