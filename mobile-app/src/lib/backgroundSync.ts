import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Storage } from './storage';
import { refreshTokens } from './auth';
import { fetchTimers } from './api';
import { scheduleTimerNotifications } from './notifications';
import { syncWidgetData } from './widgetSync';
import { appendSyncLog } from './syncLog';

export const BACKGROUND_SYNC_TASK = 'poi-notice-background-sync';
export const BACKGROUND_NOTIFICATION_TASK = 'poi-notice-background-notification';

// ---- 共通同期ロジック ----
async function performSync(source: 'foreground' | 'background' | 'push'): Promise<void> {
  let jwt: string | null = null;

  const isValid = await Storage.isJwtValid();
  if (isValid) {
    jwt = await Storage.getJwt();
  } else {
    // トークン期限切れ → refreshToken でサイレントリフレッシュ
    jwt = await refreshTokens();
  }

  const config = await Storage.getAuthConfig();
  if (!jwt || !config) return;

  const timers = await fetchTimers(config.apiUrl, jwt);
  const settings = await Storage.getNotifySettings();

  const now = Date.now();
  const [, , , widgetSynced] = await Promise.all([
    Storage.setTimersCache(timers),
    Storage.setLastSync(now),
    scheduleTimerNotifications(timers, settings),
    syncWidgetData(timers, now),
  ]);

  await appendSyncLog({ source, success: true, timerCount: timers.length, widgetSynced });
}

// ---- タスク定義（モジュール読み込み時に登録される）----
// App.tsx で import されることで定義が確実に実行される。
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    await performSync('background');
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    await appendSyncLog({
      source: 'background',
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// サイレントプッシュ受信時のバックグラウンドタスク
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data }) => {
  const notification = data as { body?: { data?: { type?: string } } };
  if (notification?.body?.data?.type !== 'timer-sync') return;

  try {
    await performSync('push');
  } catch (e) {
    await appendSyncLog({
      source: 'push',
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

// ---- タスク登録 ----
export async function registerBackgroundSync(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
  if (isRegistered) return;

  await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
    minimumInterval: 15 * 60, // 15分（iOS は OS の判断で実行タイミングが変動する）
  });
}

export async function registerBackgroundNotificationTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
  if (isRegistered) return;

  await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
}

export async function unregisterBackgroundSync(): Promise<void> {
  await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK).catch(() => {});
}
