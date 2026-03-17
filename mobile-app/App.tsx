// バックグラウンドタスクをモジュール読み込み時に定義させる（最初に import する）
import './src/lib/backgroundSync'

import React, { useState, useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as WebBrowser from 'expo-web-browser'
import { Storage, loadConfigFromOutputs } from './src/lib/storage'
import { requestPermissions } from './src/lib/notifications'
import { registerBackgroundSync } from './src/lib/backgroundSync'
import { logout } from './src/lib/auth'
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
      } catch {
        // 通知・バックグラウンド初期化の失敗はアプリ起動を止めない
      }
      try {
        const valid = await Storage.isJwtValid()
        setIsLoggedIn(valid)
      } catch {
        setIsLoggedIn(false)
      }
    }
    init()
  }, [])

  const handleLogin = () => setIsLoggedIn(true)

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
