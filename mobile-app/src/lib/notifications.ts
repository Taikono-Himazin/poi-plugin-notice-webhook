import * as Notifications from 'expo-notifications'
import { Timer, NotifySettings } from './storage'

// フォアグラウンド時の通知表示設定
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
})

const TYPE_TITLES: Record<string, string> = {
  expedition:   '遠征完了',
  repair:       '入渠完了',
  construction: '建造完了',
}

export async function requestPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

/**
 * 既存のスケジュール済み通知をすべてキャンセルし、
 * 渡されたタイマーをもとに再スケジュールする。
 * ネット接続なしでも OS が期限時刻に発火する。
 */
export async function scheduleTimerNotifications(
  timers: Timer[],
  settings: NotifySettings,
): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync()

  const now = Date.now()

  for (const timer of timers) {
    if (!settings[timer.type as keyof NotifySettings]) continue

    const triggerMs = new Date(timer.completesAt).getTime()
    if (triggerMs <= now) continue

    await Notifications.scheduleNotificationAsync({
      content: {
        title: TYPE_TITLES[timer.type] ?? 'poi 通知',
        body:  timer.message,
        data:  { type: timer.type, slot: timer.slot },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(triggerMs),
      },
    })
  }
}

export async function getScheduledCount(): Promise<number> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  return scheduled.length
}
