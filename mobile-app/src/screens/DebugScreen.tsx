import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import * as TaskManager from 'expo-task-manager';
import { isModuleAvailable, getWidgetDiagnostics } from '../../modules/widget-data';
import { getSyncLog, clearSyncLog, SyncLogEntry } from '../lib/syncLog';
import { BACKGROUND_SYNC_TASK, BACKGROUND_NOTIFICATION_TASK } from '../lib/backgroundSync';
import { registerPushToken } from '../lib/pushToken';
import { Storage } from '../lib/storage';

const APP_VERSION = Constants.expoConfig?.version ?? '-';

type Props = {
  onBack: () => void;
};

const SOURCE_LABELS: Record<string, string> = {
  foreground: 'FG',
  background: 'BG',
  push: 'Push',
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${formatTime(iso)}`;
  } catch {
    return iso;
  }
}

export default function DebugScreen({ onBack }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [widgetDiag, setWidgetDiag] = useState<Record<string, unknown> | null>(null);
  const [widgetModuleAvailable, setWidgetModuleAvailable] = useState(false);
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
  const [bgSyncRegistered, setBgSyncRegistered] = useState<boolean | null>(null);
  const [bgNotifRegistered, setBgNotifRegistered] = useState<boolean | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [pushTokenStatus, setPushTokenStatus] = useState<string | null>(null);
  const [currentPushToken, setCurrentPushToken] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [diag, log, bgSync, bgNotif] = await Promise.all([
      getWidgetDiagnostics().catch(() => null),
      getSyncLog(),
      TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK).catch(() => null),
      TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => null),
    ]);
    const pushToken = await Storage.getPushToken();
    setCurrentPushToken(pushToken);
    setWidgetModuleAvailable(isModuleAvailable());
    setWidgetDiag(diag);
    setSyncLog(log);
    setBgSyncRegistered(bgSync);
    setBgNotifRegistered(bgNotif);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleClearLog = useCallback(async () => {
    await clearSyncLog();
    setSyncLog([]);
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    if (__DEV__) {
      setUpdateStatus('開発モード (スキップ)');
      return;
    }
    setUpdateStatus('確認中...');
    try {
      const update = await Updates.checkForUpdateAsync();
      if (!update.isAvailable) {
        setUpdateStatus('最新です');
        return;
      }
      setUpdateStatus('ダウンロード中...');
      await Updates.fetchUpdateAsync();
      setUpdateStatus('適用可能');
      Alert.alert('アップデート', '新しいバージョンをダウンロードしました。再起動して適用しますか？', [
        { text: 'あとで', style: 'cancel' },
        { text: '再起動', onPress: () => Updates.reloadAsync() },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setUpdateStatus(`エラー: ${msg}`);
    }
  }, []);

  const handleReregisterPushToken = useCallback(async () => {
    setPushTokenStatus('取得中...');
    try {
      const config = await Storage.getAuthConfig();
      const jwt = await Storage.getJwt();
      if (!config || !jwt) {
        setPushTokenStatus('未ログイン');
        return;
      }
      await registerPushToken(config.apiUrl, jwt);
      const token = await Storage.getPushToken();
      setCurrentPushToken(token);
      setPushTokenStatus('登録完了');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPushTokenStatus(`エラー: ${msg}`);
    }
  }, []);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5865f2" />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>デバッグ</Text>
        <View style={{ width: 48 }} />
      </View>

      {/* バージョン情報 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>バージョン</Text>
          <TouchableOpacity onPress={handleCheckUpdate}>
            <Text style={styles.updateCheckText}>アップデート確認</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          <DiagRow label="アプリ" value={`v${APP_VERSION}`} />
          <DiagRow label="ランタイム" value={Updates.runtimeVersion ?? '-'} />
          <DiagRow label="Update ID" value={Updates.updateId ? Updates.updateId.slice(0, 8) : 'embedded'} />
          <DiagRow label="チャンネル" value={Updates.channel ?? '-'} />
          {updateStatus && <DiagRow label="状態" value={updateStatus} />}
        </View>
      </View>

      {/* ウィジェット通信診断 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ウィジェット通信</Text>
        <View style={styles.card}>
          <DiagRow
            label="ネイティブモジュール"
            value={widgetModuleAvailable ? 'OK' : 'NG'}
            ok={widgetModuleAvailable}
          />
          {widgetDiag ? (
            <>
              <DiagRow
                label="App Group"
                value={widgetDiag.appGroupAccessible ? 'OK' : 'NG'}
                ok={!!widgetDiag.appGroupAccessible}
              />
              <DiagRow label="Suite ID" value={String(widgetDiag.suiteId ?? '-')} />
              <DiagRow
                label="データ保存済み"
                value={widgetDiag.dataExists ? 'OK' : 'NG'}
                ok={!!widgetDiag.dataExists}
              />
              {widgetDiag.dataExists && (
                <>
                  <DiagRow label="データサイズ" value={`${widgetDiag.dataLength} bytes`} />
                  <DiagRow label="JSON有効" value={widgetDiag.jsonValid ? 'OK' : 'NG'} ok={!!widgetDiag.jsonValid} />
                  {widgetDiag.jsonError && <DiagRow label="JSONエラー" value={String(widgetDiag.jsonError)} />}
                  <DiagRow label="タイマー数" value={String(widgetDiag.timerCount ?? 0)} />
                  {widgetDiag.firstCompletesAt && (
                    <DiagRow label="最初の完了時刻" value={formatDate(String(widgetDiag.firstCompletesAt))} />
                  )}
                </>
              )}
              {widgetDiag.lastWrite && <DiagRow label="最終書込" value={formatLastWrite(widgetDiag.lastWrite)} />}
            </>
          ) : (
            <Text style={styles.dimText}>
              {widgetModuleAvailable ? '診断データ取得失敗' : 'モジュール未ロード (Expo Go?)'}
            </Text>
          )}
        </View>
      </View>

      {/* バックグラウンドタスク */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>バックグラウンドタスク</Text>
        <View style={styles.card}>
          <DiagRow
            label="定期同期 (15分)"
            value={bgSyncRegistered === null ? '不明' : bgSyncRegistered ? '登録済み' : '未登録'}
            ok={bgSyncRegistered === true}
          />
          <DiagRow
            label="プッシュ受信"
            value={bgNotifRegistered === null ? '不明' : bgNotifRegistered ? '登録済み' : '未登録'}
            ok={bgNotifRegistered === true}
          />
        </View>
      </View>

      {/* Push トークン */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Push トークン</Text>
          <TouchableOpacity onPress={handleReregisterPushToken}>
            <Text style={styles.updateCheckText}>再取得</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          <DiagRow label="トークン" value={currentPushToken ?? '未登録'} />
          {pushTokenStatus && <DiagRow label="状態" value={pushTokenStatus} />}
        </View>
      </View>

      {/* 同期ログ */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>同期ログ (最新30件)</Text>
          {syncLog.length > 0 && (
            <TouchableOpacity onPress={handleClearLog}>
              <Text style={styles.clearText}>クリア</Text>
            </TouchableOpacity>
          )}
        </View>
        {syncLog.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.dimText}>ログなし — 同期後に表示されます</Text>
          </View>
        ) : (
          syncLog.slice(0, 30).map((entry, i) => (
            <View key={i} style={styles.logRow}>
              <Text style={styles.logTime}>{formatDate(entry.time)}</Text>
              <Text style={[styles.logSource, { color: entry.source === 'foreground' ? '#5865f2' : '#57f287' }]}>
                {SOURCE_LABELS[entry.source] ?? entry.source}
              </Text>
              <Text style={entry.success ? styles.logOk : styles.logNg}>{entry.success ? 'OK' : 'NG'}</Text>
              <Text style={styles.logDetail}>
                {entry.success ? `${entry.timerCount ?? 0}件${entry.widgetSynced ? '' : ' W:NG'}` : (entry.error ?? '')}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ---- Helper Components ----

function DiagRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <View style={styles.diagRow}>
      <Text style={styles.diagLabel}>{label}</Text>
      <Text style={[styles.diagValue, ok === true && styles.okText, ok === false && styles.ngText]}>{value}</Text>
    </View>
  );
}

function formatLastWrite(raw: unknown): string {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const rec = obj as Record<string, unknown>;
    if (rec.writeTime) return `${formatDate(String(rec.writeTime))} (${rec.dataLength}b)`;
    return JSON.stringify(rec);
  } catch {
    return String(raw);
  }
}

// ---- Styles ----

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: (Constants.statusBarHeight ?? 0) + 12,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  backText: { color: '#5865f2', fontSize: 14 },
  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: {
    color: '#666',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  clearText: { color: '#ff6b6b', fontSize: 12 },
  updateCheckText: { color: '#5865f2', fontSize: 12 },
  card: { backgroundColor: '#1e1e30', borderRadius: 12, padding: 14 },
  dimText: { color: '#555', fontSize: 13 },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  diagLabel: { color: '#999', fontSize: 13 },
  diagValue: { color: '#fff', fontSize: 13, fontFamily: 'Courier' },
  okText: { color: '#57f287' },
  ngText: { color: '#ff6b6b' },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e30',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
    gap: 8,
  },
  logTime: { color: '#666', fontSize: 11, fontFamily: 'Courier', width: 90 },
  logSource: { fontSize: 11, fontWeight: 'bold', width: 32 },
  logOk: { color: '#57f287', fontSize: 11, fontWeight: 'bold', width: 20 },
  logNg: { color: '#ff6b6b', fontSize: 11, fontWeight: 'bold', width: 20 },
  logDetail: { color: '#999', fontSize: 11, flex: 1 },
});
