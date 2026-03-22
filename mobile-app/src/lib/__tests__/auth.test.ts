import * as AuthSession from 'expo-auth-session'
import AsyncStorage from '@react-native-async-storage/async-storage'

// auth.ts 内の parseJwt で atob を使うのでグローバルに定義
;(global as any).atob = (str: string) => Buffer.from(str, 'base64').toString('binary')

import { login, refreshTokens, logout } from '../auth'
import { Storage } from '../storage'

beforeEach(() => {
  jest.clearAllMocks()
  ;(AsyncStorage as any)._resetStore()
})

function makeIdToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64')
  return `${header}.${body}.signature`
}

describe('login', () => {
  const config = {
    apiUrl: 'https://test.execute-api.ap-northeast-1.amazonaws.com/v1',
    clientId: 'client-123',
    cognitoDomain: 'test-domain',
  }

  it('OAuth 成功時に JWT と email を返す', async () => {
    const idToken = makeIdToken({ email: 'user@example.com', exp: 9999999999 })

    const mockRequest = {
      codeVerifier: 'test-verifier',
      promptAsync: jest.fn().mockResolvedValue({
        type: 'success',
        params: { code: 'auth-code-123' },
      }),
    }
    ;(AuthSession.AuthRequest as unknown as jest.Mock).mockImplementation(() => mockRequest)
    ;(AuthSession.exchangeCodeAsync as jest.Mock).mockResolvedValue({
      idToken,
      refreshToken: 'refresh-token-abc',
    })

    const result = await login(config)

    expect(result.email).toBe('user@example.com')
    expect(result.jwt).toBe(idToken)
  })

  it('キャンセル時にエラーを投げる', async () => {
    const mockRequest = {
      codeVerifier: 'test-verifier',
      promptAsync: jest.fn().mockResolvedValue({ type: 'cancel' }),
    }
    ;(AuthSession.AuthRequest as unknown as jest.Mock).mockImplementation(() => mockRequest)

    await expect(login(config)).rejects.toThrow('キャンセル')
  })

  it('失敗時にエラーを投げる', async () => {
    const mockRequest = {
      codeVerifier: 'test-verifier',
      promptAsync: jest.fn().mockResolvedValue({ type: 'error' }),
    }
    ;(AuthSession.AuthRequest as unknown as jest.Mock).mockImplementation(() => mockRequest)

    await expect(login(config)).rejects.toThrow('失敗')
  })
})

describe('refreshTokens', () => {
  it('config か refreshToken がなければ null', async () => {
    const result = await refreshTokens()
    expect(result).toBeNull()
  })

  it('refreshToken がある場合に新しい idToken を返す', async () => {
    const config = {
      apiUrl: 'https://test.execute-api.ap-northeast-1.amazonaws.com/v1',
      clientId: 'client-123',
      cognitoDomain: 'test-domain',
    }
    await Storage.setAuthConfig(config)
    await Storage.setJwt('old-token', Date.now() - 1000, 'refresh-token')

    const newIdToken = makeIdToken({ email: 'user@example.com', exp: 9999999999 })
    ;(AuthSession.refreshAsync as jest.Mock).mockResolvedValue({
      idToken: newIdToken,
      refreshToken: 'new-refresh-token',
    })

    const result = await refreshTokens()
    expect(result).toBe(newIdToken)
  })
})

describe('logout', () => {
  it('JWT をクリアする', async () => {
    await Storage.setJwt('token', 9999999999999, 'refresh')
    await logout()
    expect(await Storage.getJwt()).toBeNull()
  })
})
