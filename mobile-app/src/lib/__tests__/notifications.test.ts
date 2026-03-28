import * as Notifications from 'expo-notifications';

// backgroundSync が notifications を import するときにタスク定義が走るのを防ぐ
jest.mock('expo-background-task');
jest.mock('expo-task-manager');

import { requestPermissions, scheduleTimerNotifications, getScheduledCount } from '../notifications';
import { Timer, NotifySettings } from '../storage';

beforeEach(() => jest.clearAllMocks());

describe('requestPermissions', () => {
  it('granted なら true を返す', async () => {
    expect(await requestPermissions()).toBe(true);
  });

  it('denied なら false を返す', async () => {
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    expect(await requestPermissions()).toBe(false);
  });
});

describe('scheduleTimerNotifications', () => {
  const futureDate = new Date(Date.now() + 3_600_000).toISOString(); // 1時間後
  const pastDate = new Date(Date.now() - 1_000).toISOString();

  const settings: NotifySettings = { expedition: true, repair: true, construction: false };

  it('未来のタイマーのみスケジュールする', async () => {
    const timers: Timer[] = [
      { type: 'expedition', slot: 1, completesAt: futureDate, message: '遠征1' },
      { type: 'repair', slot: 2, completesAt: pastDate, message: '入渠2（完了済み）' },
    ];

    await scheduleTimerNotifications(timers, settings);

    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ title: '遠征完了', body: '遠征1' }),
      }),
    );
  });

  it('設定で無効にしたタイプはスケジュールしない', async () => {
    const timers: Timer[] = [{ type: 'construction', slot: 1, completesAt: futureDate, message: '建造1' }];

    await scheduleTimerNotifications(timers, settings);

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('空配列の場合はキャンセルのみ', async () => {
    await scheduleTimerNotifications([], settings);
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('getScheduledCount', () => {
  it('スケジュール済み通知の件数を返す', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([{}, {}, {}]);
    expect(await getScheduledCount()).toBe(3);
  });
});
