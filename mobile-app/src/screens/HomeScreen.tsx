import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, Switch,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import { Storage, Timer, NotifySettings } from '../lib/storage'
import { fetchTimers } from '../lib/api'
import { scheduleTimerNotifications, getScheduledCount } from '../lib/notifications'

type Props = {
  onLogout: () => void
}

const TYPE_LABELS: Record<string, string> = {
  expedition:   '遠征',
  repair:       '入渠',
  construction: '建造',
}

const TYPE_COLORS: Record<string, string> = {
  expedition:   '#5865f2',
  repair:       '#57f287',
  construction: '#fee75c',
}

function formatRemaining(completesAt: string): string {
  const ms = new Date(completesAt).getTime() - Date.now()
  if (ms <= 0) return '完了'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  if (h > 0) return `${h}時間${m}分`
  if (m > 0) return `${m}分${s}秒`
  return `${s}秒`
}

export default function HomeScreen({ onLogout }: Props) {
  const [timers,         setTimers]         = useState<Timer[]>([])
  const [settings,       setSettings]       = useState<NotifySettings>({ expedition: true, repair: true, construction: true })
  const [lastSync,       setLastSync]       = useState<number | null>(null)
  const [scheduledCount, setScheduledCount] = useState(0)
  const [syncing,        setSyncing]        = useState(false)
  const [, setTick] = useState(0)

  // 残り時間表示を毎秒更新
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  const loadFromCache = useCallback(async () => {
    const [cached, s, ls, sc] = await Promise.all([
      Storage.getTimersCache(),
      Storage.getNotifySettings(),
      Storage.getLastSync(),
      getScheduledCount(),
    ])
    setTimers(cached)
    setSettings(s)
    setLastSync(ls)
    setScheduledCount(sc)
  }, [])

  useEffect(() => { loadFromCache() }, [loadFromCache])

  const sync = useCallback(async () => {
    setSyncing(true)
    try {
      const [jwt, config] = await Promise.all([Storage.getJwt(), Storage.getAuthConfig()])
      if (!jwt || !config) {
        Alert.alert('エラー', 'ログインが必要です')
        return
      }

      const [fetched, s] = await Promise.all([
        fetchTimers(config.apiUrl, jwt),
        Storage.getNotifySettings(),
      ])

      await Promise.all([
        Storage.setTimersCache(fetched),
        Storage.setLastSync(Date.now()),
        scheduleTimerNotifications(fetched, s),
      ])

      const sc = await getScheduledCount()
      setTimers(fetched)
      setLastSync(Date.now())
      setScheduledCount(sc)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      Alert.alert('同期失敗', msg)
    } finally {
      setSyncing(false)
    }
  }, [])

  const forceSync = useCallback(async () => {
    setSyncing(true)
    setForceResult(null)
    try {
      const [jwt, config] = await Promise.all([Storage.getJwt(), Storage.getAuthConfig()])
      if (!jwt || !config) {
        Alert.alert('エラー', 'ログインが必要です')
        return
      }

      // キャッシュを破棄してから取得
      await Storage.setTimersCache([])

      const [fetched, s] = await Promise.all([
        fetchTimers(config.apiUrl, jwt),
        Storage.getNotifySettings(),
      ])

      await Promise.all([
        Storage.setTimersCache(fetched),
        Storage.setLastSync(Date.now()),
        scheduleTimerNotifications(fetched, s),
      ])

      const sc = await getScheduledCount()
      setTimers(fetched)
      setLastSync(Date.now())
      setScheduledCount(sc)

      const counts = { expedition: 0, repair: 0, construction: 0 } as Record<string, number>
      for (const t of fetched) counts[t.type] = (counts[t.type] ?? 0) + 1
      setForceResult(
        `遠征 ${counts.expedition} / 入渠 ${counts.repair} / 建造 ${counts.construction}`
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      Alert.alert('強制同期失敗', msg)
    } finally {
      setSyncing(false)
    }
  }, [])

  const toggleSetting = useCallback(async (key: keyof NotifySettings, value: boolean) => {
    const next = { ...settings, [key]: value }
    setSettings(next)
    await Storage.setNotifySettings(next)

    const cached = await Storage.getTimersCache()
    await scheduleTimerNotifications(cached, next)
    setScheduledCount(await getScheduledCount())
  }, [settings])

  const handleLogout = useCallback(() => {
    Alert.alert('ログアウト', 'ログアウトすると通知スケジュールが消えます。よろしいですか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'ログアウト', style: 'destructive', onPress: onLogout },
    ])
  }, [onLogout])

  const active = timers.filter(t => new Date(t.completesAt).getTime() > Date.now())

  const lastSyncText = lastSync
    ? `最終同期: ${new Date(lastSync).toLocaleTimeString('ja-JP')}`
    : '未同期'

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={sync} tintColor="#5865f2" />}
    >
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>poi 通知転送</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>ログアウト</Text>
        </TouchableOpacity>
      </View>

      {/* 同期ステータス */}
      <View style={styles.statusCard}>
        <Text style={styles.statusText}>{lastSyncText}</Text>
        <Text style={styles.statusSub}>通知スケジュール済み: {scheduledCount} 件</Text>
        <View style={styles.syncRow}>
          <TouchableOpacity style={[styles.syncButton, styles.syncButtonHalf]} onPress={sync} disabled={syncing}>
            {syncing
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.syncButtonText}>今すぐ同期</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={[styles.syncButton, styles.syncButtonHalf, styles.forceSyncButton]} onPress={forceSync} disabled={syncing}>
            {syncing
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.syncButtonText}>強制同期</Text>
            }
          </TouchableOpacity>
        </View>
        {forceResult && (
          <Text style={styles.forceResultText}>取得: {forceResult}</Text>
        )}
      </View>

      {/* 通知設定 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>通知する項目</Text>
        {(['expedition', 'repair', 'construction'] as const).map(key => (
          <View key={key} style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.dot, { backgroundColor: TYPE_COLORS[key] }]} />
              <Text style={styles.settingLabel}>{TYPE_LABELS[key]}</Text>
            </View>
            <Switch
              value={settings[key]}
              onValueChange={v => toggleSetting(key, v)}
              trackColor={{ false: '#333', true: '#5865f2' }}
              thumbColor="#fff"
            />
          </View>
        ))}
      </View>

      {/* タイマー一覧 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          進行中のタイマー{active.length > 0 ? ` (${active.length})` : ''}
        </Text>

        {active.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {timers.length === 0
                ? '↑「今すぐ同期」でタイマーを取得してください'
                : '現在進行中のタイマーはありません'}
            </Text>
          </View>
        ) : (
          active.map((timer, i) => (
            <View
              key={i}
              style={[styles.timerCard, { borderLeftColor: TYPE_COLORS[timer.type] ?? '#888' }]}
            >
              <View style={styles.timerHeader}>
                <View style={[styles.badge, { backgroundColor: TYPE_COLORS[timer.type] ?? '#888' }]}>
                  <Text style={styles.badgeText}>{TYPE_LABELS[timer.type]}</Text>
                </View>
                <Text style={styles.remaining}>{formatRemaining(timer.completesAt)}</Text>
              </View>
              <Text style={styles.timerMessage}>{timer.message}</Text>
              <Text style={styles.timerTime}>
                完了予定: {new Date(timer.completesAt).toLocaleTimeString('ja-JP')}
                {timer.type !== 'expedition' ? `  ／  ドック${timer.slot}` : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      <Text style={styles.pullHint}>↓ 引っ張って同期 / 機内モードでも通知が届きます</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0f0f1a' },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 56 },
  headerTitle:    { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  logoutText:     { color: '#666', fontSize: 14 },
  statusCard:     { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#1e1e30', borderRadius: 12, padding: 16 },
  statusText:     { color: '#ccc', fontSize: 13, marginBottom: 2 },
  statusSub:      { color: '#666', fontSize: 12, marginBottom: 12 },
  syncRow:          { flexDirection: 'row', gap: 8 },
  syncButton:       { backgroundColor: '#5865f2', borderRadius: 8, padding: 12, alignItems: 'center' },
  syncButtonHalf:   { flex: 1 },
  forceSyncButton:  { backgroundColor: '#4a4a6a' },
  syncButtonText:   { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  forceResultText:  { color: '#57f287', fontSize: 12, marginTop: 8 },
  section:        { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle:   { color: '#666', fontSize: 11, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  settingRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e1e30', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 6 },
  settingLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot:            { width: 8, height: 8, borderRadius: 4 },
  settingLabel:   { color: '#fff', fontSize: 15 },
  timerCard:      { backgroundColor: '#1e1e30', borderRadius: 10, padding: 14, marginBottom: 8, borderLeftWidth: 3 },
  timerHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  badge:          { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText:      { color: '#0f0f1a', fontSize: 11, fontWeight: 'bold' },
  remaining:      { color: '#fff', fontSize: 18, fontWeight: 'bold', fontVariant: ['tabular-nums'] },
  timerMessage:   { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  timerTime:      { color: '#555', fontSize: 11 },
  emptyCard:      { backgroundColor: '#1e1e30', borderRadius: 10, padding: 24, alignItems: 'center' },
  emptyText:      { color: '#555', textAlign: 'center', fontSize: 13, lineHeight: 20 },
  pullHint:       { color: '#2a2a3a', textAlign: 'center', fontSize: 12, padding: 16, paddingBottom: 40 },
})
