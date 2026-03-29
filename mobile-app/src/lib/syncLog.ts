import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sync_log';
const MAX_ENTRIES = 50;

export type SyncLogEntry = {
  time: string; // ISO8601
  source: 'foreground' | 'background' | 'push';
  success: boolean;
  timerCount?: number;
  widgetSynced?: boolean;
  error?: string;
};

export async function appendSyncLog(entry: Omit<SyncLogEntry, 'time'>): Promise<void> {
  try {
    const log = await getSyncLog();
    log.unshift({ ...entry, time: new Date().toISOString() });
    await AsyncStorage.setItem(KEY, JSON.stringify(log.slice(0, MAX_ENTRIES)));
  } catch {
    // ログ記録自体の失敗は無視
  }
}

export async function getSyncLog(): Promise<SyncLogEntry[]> {
  try {
    const val = await AsyncStorage.getItem(KEY);
    return val ? JSON.parse(val) : [];
  } catch {
    return [];
  }
}

export async function clearSyncLog(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
