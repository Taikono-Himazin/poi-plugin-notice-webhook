// バックグラウンドタスクをモジュール読み込み時に定義させる（最初に import する）
import './src/lib/backgroundSync'

import React, { useState, useEffect, useCallback } from 'react'
import { View, ActivityIndicator, Alert } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as WebBrowser from 'expo-web-browser'
import * as Updates from 'expo-updates'
import { Storage, loadConfigFromOutputs } from './src/lib/storage'
import { requestPermissions } from './src/lib/notifications'
import { registerBackgroundSync, registerBackgroundNotificationTask } from './src/lib/backgroundSync'
import { logout, refreshTokens } from './src/lib/auth'
import { registerPushToken } from './src/lib/pushToken'
import LoginScreen from './src/screens/LoginScreen'
import HomeScreen from './src/screens/HomeScreen'

// Cognito の OAuth フロー後にブラウザを自動で閉じる
WebBrowser.maybeCompleteAuthSession()

export default function App() {
  // null = 起動中 / true = ログイン済み / false = 未ログイン
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    async function init() {
      // aws-outputs.json から設定を読み込み AsyncStorage に保存（deploy 後に自動反映）
      const outputsConfig = loadConfigFromOutputs()
      if (outputsConfig) {
        await Storage.setAuthConfig(outputsConfig)
      }

      try {
        await requestPermissions()
        await registerBackgroundSync()
        await registerBackgroundNotificationTask()
      } catch {
        // 通知・バックグラウンド初期化の失敗はアプリ起動を止めない
      }
      try {
        let valid = await Storage.isJwtValid()
        if (!valid) {
          // トークン期限切れ → refreshToken でサイレントリフレッシュを試行
          const newJwt = await refreshTokens()
          valid = !!newJwt
        }
        setIsLoggedIn(valid)

        // ログイン済みならプッシュトークンをサーバに登録
        if (valid) {
          const [jwt, config] = await Promise.all([
            Storage.getJwt(),
            Storage.getAuthConfig(),
          ])
          if (jwt && config) {
            registerPushToken(config.apiUrl, jwt).catch(() => {})
          }
        }
      } catch {
        setIsLoggedIn(false)
      }
    }
    init()
  }, [])

  // OTA アップデートチェック（起動時）
  const checkForUpdate = useCallback(async () => {
    if (__DEV__) return;
    try {
      const update = await Updates.checkForUpdateAsync();
      if (!update.isAvailable) return;
      await Updates.fetchUpdateAsync();
      Alert.alert(
        'アップデート',
        '新しいバージョンが利用可能です。再起動して適用しますか？',
        [
          { text: 'あとで', style: 'cancel' },
          { text: '再起動', onPress: () => Updates.reloadAsync() },
        ],
      );
    } catch {
      // アップデートチェックの失敗はアプリ動作に影響させない
    }
  }, []);

  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);

  const handleLogin = async () => {
    setIsLoggedIn(true)
    try {
      const [jwt, config] = await Promise.all([
        Storage.getJwt(),
        Storage.getAuthConfig(),
      ])
      if (jwt && config) {
        await registerPushToken(config.apiUrl, jwt)
      }
    } catch {
      // プッシュトークン登録の失敗はログインに影響させない
    }
  }

  const handleLogout = async () => {
    await logout()
    setIsLoggedIn(false)
  }

  if (isLoggedIn === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f0f1a', justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style="light" />
        <ActivityIndicator color="#5865f2" size="large" />
      </View>
    )
  }

  return (
    <>
      <StatusBar style="light" />
      {isLoggedIn
        ? <HomeScreen onLogout={handleLogout} />
        : <LoginScreen onLogin={handleLogin} />
      }
    </>
  )
}
