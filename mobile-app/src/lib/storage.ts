import AsyncStorage from '@react-native-async-storage/async-storage'
// deploy.ps1 実行後に aws/ から mobile-app/ へコピーされる CDK Outputs
// ファイルが空({})の場合は null を返す
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _rawOutputs = require('../../aws-outputs.json') as Record<string, Record<string, string>>

export function loadConfigFromOutputs(): AuthConfig | null {
  try {
    const stack = _rawOutputs['PoiWebhookStack'] ?? (Object.values(_rawOutputs)[0] as Record<string, string> | undefined)
    if (!stack) return null
    const apiUrl        = (stack['ApiUrl'] ?? '').replace(/\/$/, '')
    const clientId      = stack['UserPoolClientId'] ?? ''
    const cognitoDomain = stack['CognitoDomain'] ?? ''
    if (!apiUrl || !clientId || !cognitoDomain) return null
    return { apiUrl, clientId, cognitoDomain }
  } catch {
    return null
  }
}

const KEYS = {
  JWT:               'jwt',
  JWT_EXPIRY:        'jwt_expiry',
  REFRESH_TOKEN:     'refresh_token',
  API_URL:           'api_url',
  CLIENT_ID:         'client_id',
  COGNITO_DOMAIN:    'cognito_domain',
  TIMERS_CACHE:      'timers_cache',
  NOTIFY_EXPEDITION: 'notify_expedition',
  NOTIFY_REPAIR:     'notify_repair',
  NOTIFY_CONSTRUCTION: 'notify_construction',
  LAST_SYNC:         'last_sync',
  PUSH_TOKEN:        'push_token',
} as const

export type Timer = {
  type:        'expedition' | 'repair' | 'construction'
  slot:        number
  completesAt: string
  message:     string
  notifyBeforeMinutes?: number
}

export type NotifySettings = {
  expedition:   boolean
  repair:       boolean
  construction: boolean
}

export type AuthConfig = {
  apiUrl:        string
  clientId:      string
  cognitoDomain: string
}

export const Storage = {
  async getJwt(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.JWT)
  },

  async setJwt(jwt: string, expiry: number, refreshToken?: string): Promise<void> {
    const pairs: [string, string][] = [
      [KEYS.JWT, jwt],
      [KEYS.JWT_EXPIRY, String(expiry)],
    ]
    if (refreshToken) pairs.push([KEYS.REFRESH_TOKEN, refreshToken])
    await AsyncStorage.multiSet(pairs)
  },

  async getRefreshToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.REFRESH_TOKEN)
  },

  async clearJwt(): Promise<void> {
    await AsyncStorage.multiRemove([KEYS.JWT, KEYS.JWT_EXPIRY, KEYS.REFRESH_TOKEN])
  },

  async isJwtValid(): Promise<boolean> {
    const pairs = await AsyncStorage.multiGet([KEYS.JWT, KEYS.JWT_EXPIRY])
    const jwt    = pairs[0][1]
    const expiry = pairs[1][1]
    if (!jwt || !expiry) return false
    // 1分のバッファを持たせる
    return Number(expiry) > Date.now() + 60_000
  },

  async getAuthConfig(): Promise<AuthConfig | null> {
    const pairs = await AsyncStorage.multiGet([
      KEYS.API_URL, KEYS.CLIENT_ID, KEYS.COGNITO_DOMAIN,
    ])
    const apiUrl        = pairs[0][1]
    const clientId      = pairs[1][1]
    const cognitoDomain = pairs[2][1]
    if (!apiUrl || !clientId || !cognitoDomain) return null
    return { apiUrl, clientId, cognitoDomain }
  },

  async setAuthConfig(config: AuthConfig): Promise<void> {
    await AsyncStorage.multiSet([
      [KEYS.API_URL,        config.apiUrl],
      [KEYS.CLIENT_ID,      config.clientId],
      [KEYS.COGNITO_DOMAIN, config.cognitoDomain],
    ])
  },

  async getTimersCache(): Promise<Timer[]> {
    const val = await AsyncStorage.getItem(KEYS.TIMERS_CACHE)
    if (!val) return []
    try { return JSON.parse(val) } catch { return [] }
  },

  async setTimersCache(timers: Timer[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.TIMERS_CACHE, JSON.stringify(timers))
  },

  async getNotifySettings(): Promise<NotifySettings> {
    const pairs = await AsyncStorage.multiGet([
      KEYS.NOTIFY_EXPEDITION, KEYS.NOTIFY_REPAIR, KEYS.NOTIFY_CONSTRUCTION,
    ])
    return {
      expedition:   pairs[0][1] !== 'false',
      repair:       pairs[1][1] !== 'false',
      construction: pairs[2][1] !== 'false',
    }
  },

  async setNotifySettings(settings: NotifySettings): Promise<void> {
    await AsyncStorage.multiSet([
      [KEYS.NOTIFY_EXPEDITION,   String(settings.expedition)],
      [KEYS.NOTIFY_REPAIR,       String(settings.repair)],
      [KEYS.NOTIFY_CONSTRUCTION, String(settings.construction)],
    ])
  },

  async getLastSync(): Promise<number | null> {
    const val = await AsyncStorage.getItem(KEYS.LAST_SYNC)
    return val ? Number(val) : null
  },

  async setLastSync(ts: number): Promise<void> {
    await AsyncStorage.setItem(KEYS.LAST_SYNC, String(ts))
  },

  async getPushToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.PUSH_TOKEN)
  },

  async setPushToken(token: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.PUSH_TOKEN, token)
  },

  async clearPushToken(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.PUSH_TOKEN)
  },
}
