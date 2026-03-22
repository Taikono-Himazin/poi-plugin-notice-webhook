import React from 'react'
import { render, act } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

;(globalThis as any).atob = (str: string) => Buffer.from(str, 'base64').toString('binary')

jest.mock('../lib/notifications', () => ({
  requestPermissions: jest.fn(() => Promise.resolve(true)),
  scheduleTimerNotifications: jest.fn(() => Promise.resolve()),
  getScheduledCount: jest.fn(() => Promise.resolve(0)),
  setNotificationHandler: jest.fn(),
}))

jest.mock('../lib/backgroundSync', () => ({
  BACKGROUND_SYNC_TASK: 'poi-notice-background-sync',
  registerBackgroundSync: jest.fn(() => Promise.resolve()),
}))

jest.mock('../lib/auth', () => ({
  refreshTokens: jest.fn(() => Promise.resolve(null)),
  logout: jest.fn(() => Promise.resolve()),
  login: jest.fn(),
}))

jest.mock('../lib/api', () => ({
  fetchTimers: jest.fn(() => Promise.resolve([])),
}))

jest.mock('../lib/storage', () => {
  const actual = jest.requireActual('../lib/storage')
  return {
    ...actual,
    loadConfigFromOutputs: jest.fn(() => null),
    Storage: {
      ...actual.Storage,
      isJwtValid: jest.fn(() => Promise.resolve(false)),
    },
  }
})

import App from '../../App'

beforeEach(() => {
  jest.clearAllMocks()
  ;(AsyncStorage as any)._resetStore()
})

describe('App', () => {
  it('未ログイン時に LoginScreen が表示される', async () => {
    const { getByText } = render(<App />)

    // useEffect 内の init() の Promise チェーンをすべて解決させる
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(getByText('ログイン')).toBeTruthy()
  })
})
