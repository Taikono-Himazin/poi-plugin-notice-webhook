import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../../lib/api', () => ({ fetchTimers: jest.fn() }));
jest.mock('../../lib/notifications', () => ({
  scheduleTimerNotifications: jest.fn(() => Promise.resolve()),
  getScheduledCount: jest.fn(() => Promise.resolve(2)),
}));
jest.mock('../../lib/widgetSync', () => ({
  syncWidgetData: jest.fn(() => Promise.resolve()),
}));

import HomeScreen from '../HomeScreen';
import { Storage } from '../../lib/storage';

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage as any)._resetStore();
});

describe('HomeScreen', () => {
  it('ヘッダーとログアウトボタンが表示される', async () => {
    const { getByText } = render(<HomeScreen onLogout={jest.fn()} />);

    await waitFor(() => {
      expect(getByText('poi 通知転送')).toBeTruthy();
      expect(getByText('ログアウト')).toBeTruthy();
    });
  });

  it('通知設定のスイッチが3つ表示される', async () => {
    const { getByText } = render(<HomeScreen onLogout={jest.fn()} />);

    await waitFor(() => {
      expect(getByText('遠征')).toBeTruthy();
      expect(getByText('入渠')).toBeTruthy();
      expect(getByText('建造')).toBeTruthy();
    });
  });

  it('キャッシュからタイマーを読み込んで表示する', async () => {
    const futureDate = new Date(Date.now() + 3_600_000).toISOString();
    await Storage.setTimersCache([{ type: 'expedition', slot: 1, completesAt: futureDate, message: '遠征1完了予定' }]);

    const { getByText } = render(<HomeScreen onLogout={jest.fn()} />);

    await waitFor(() => {
      expect(getByText('遠征1完了予定')).toBeTruthy();
    });
  });

  it('タイマーが空の場合は同期を促すメッセージを表示', async () => {
    const { getByText } = render(<HomeScreen onLogout={jest.fn()} />);

    await waitFor(() => {
      expect(getByText(/引っ張って同期でタイマーを取得/)).toBeTruthy();
    });
  });

  it('「このアプリについて」ボタンが表示される', async () => {
    const { getByText } = render(<HomeScreen onLogout={jest.fn()} />);

    await waitFor(() => {
      expect(getByText('このアプリについて')).toBeTruthy();
    });
  });
});
