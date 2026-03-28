import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import axios from 'axios'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

import { registerPushToken } from '../pushToken'

beforeEach(() => {
  jest.clearAllMocks()
  ;(AsyncStorage as any)._resetStore()
})

describe('registerPushToken', () => {
  it('権限がある場合、トークンを取得してサーバに登録する', async () => {
    ;(Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' })
    ;(Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[test-123]',
    })
    mockedAxios.put.mockResolvedValue({ data: { ok: true } })

    await registerPushToken('https://api.example.com', 'jwt-token')

    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalled()
    expect(mockedAxios.put).toHaveBeenCalledWith(
      'https://api.example.com/push-tokens',
      { pushToken: 'ExponentPushToken[test-123]' },
      expect.objectContaining({
        headers: { Authorization: 'Bearer jwt-token' },
      }),
    )

    // ローカルにキャッシュされている
    const stored = await AsyncStorage.getItem('push_token')
    expect(stored).toBe('ExponentPushToken[test-123]')
  })

  it('権限がない場合は何もしない', async () => {
    ;(Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' })

    await registerPushToken('https://api.example.com', 'jwt-token')

    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled()
    expect(mockedAxios.put).not.toHaveBeenCalled()
  })
})
