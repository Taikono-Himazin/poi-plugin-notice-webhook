jest.mock('../widgetSync', () => ({
  syncWidgetData: jest.fn(() => Promise.resolve()),
}));

import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
(global as any).atob = (str: string) => Buffer.from(str, 'base64').toString('binary');

import {
  BACKGROUND_SYNC_TASK,
  BACKGROUND_NOTIFICATION_TASK,
  registerBackgroundSync,
  registerBackgroundNotificationTask,
  unregisterBackgroundSync,
} from '../backgroundSync';

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage as any)._resetStore();
});

describe('BACKGROUND_SYNC_TASK', () => {
  it('タスク名が定義されている', () => {
    expect(BACKGROUND_SYNC_TASK).toBe('poi-notice-background-sync');
  });

  it('defineTask で登録されている', () => {
    // defineTask はモジュール読み込み時に呼ばれるため、
    // モックの _tasks に関数が登録されているかで確認する
    expect((TaskManager as any)._tasks['poi-notice-background-sync']).toBeDefined();
  });
});

describe('BACKGROUND_NOTIFICATION_TASK', () => {
  it('タスク名が定義されている', () => {
    expect(BACKGROUND_NOTIFICATION_TASK).toBe('poi-notice-background-notification');
  });

  it('defineTask で登録されている', () => {
    expect((TaskManager as any)._tasks['poi-notice-background-notification']).toBeDefined();
  });

  it('timer-sync ペイロードで performSync を実行する', async () => {
    // Expo の Notification 構造に合わせたペイロード
    const taskFn = (TaskManager as any)._tasks['poi-notice-background-notification'];
    // performSync は認証なしで早期リターンするが、エラーにならないことを確認
    await expect(
      taskFn({
        data: {
          notification: {
            request: { content: { data: { type: 'timer-sync' } } },
          },
        },
      }),
    ).resolves.not.toThrow();
  });

  it('timer-sync 以外のペイロードは無視する', async () => {
    const taskFn = (TaskManager as any)._tasks['poi-notice-background-notification'];
    await expect(
      taskFn({
        data: {
          notification: {
            request: { content: { data: { type: 'other' } } },
          },
        },
      }),
    ).resolves.not.toThrow();
  });
});

describe('registerBackgroundSync', () => {
  it('未登録の場合はタスクを登録する', async () => {
    (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(false);
    await registerBackgroundSync();
    expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith('poi-notice-background-sync', {
      minimumInterval: 900,
    });
  });

  it('登録済みの場合はスキップする', async () => {
    (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(true);
    await registerBackgroundSync();
    expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
  });
});

describe('registerBackgroundNotificationTask', () => {
  it('未登録の場合はタスクを登録する', async () => {
    (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(false);
    await registerBackgroundNotificationTask();
    expect(Notifications.registerTaskAsync).toHaveBeenCalledWith('poi-notice-background-notification');
  });

  it('登録済みの場合はスキップする', async () => {
    (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(true);
    await registerBackgroundNotificationTask();
    expect(Notifications.registerTaskAsync).not.toHaveBeenCalled();
  });
});

describe('unregisterBackgroundSync', () => {
  it('タスクを解除する', async () => {
    await unregisterBackgroundSync();
    expect(BackgroundTask.unregisterTaskAsync).toHaveBeenCalledWith('poi-notice-background-sync');
  });

  it('エラーが発生しても例外を投げない', async () => {
    (BackgroundTask.unregisterTaskAsync as jest.Mock).mockRejectedValue(new Error('not registered'));
    await expect(unregisterBackgroundSync()).resolves.toBeUndefined();
  });
});
