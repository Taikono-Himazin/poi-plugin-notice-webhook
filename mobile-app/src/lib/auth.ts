import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { Platform, NativeModules } from 'react-native'
import { Storage, AuthConfig } from './storage'

WebBrowser.maybeCompleteAuthSession()

// スタンドアロンビルドでは poi-notice://auth、
// Expo Go 開発時は exp://... が自動で使われる
const REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: 'poi-notice',
  path:   'auth',
})

const LOGOUT_URI = AuthSession.makeRedirectUri({
  scheme: 'poi-notice',
  path:   'logout',
})

function buildDiscovery(cognitoDomain: string, region: string) {
  const base = `https://${cognitoDomain}.auth.${region}.amazoncognito.com`
  return {
    authorizationEndpoint: `${base}/oauth2/authorize`,
    tokenEndpoint:         `${base}/oauth2/token`,
    revocationEndpoint:    `${base}/oauth2/revoke`,
  }
}

function extractRegion(apiUrl: string): string {
  const m = apiUrl.match(/execute-api\.([^.]+)\.amazonaws\.com/)
  return m ? m[1] : 'ap-northeast-1'
}

function parseJwt(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  return JSON.parse(atob(payload))
}

function getDeviceLanguage(): string {
  try {
    const locale =
      Platform.OS === 'ios'
        ? NativeModules.SettingsManager?.settings?.AppleLocale ??
          NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
        : NativeModules.I18nManager?.localeIdentifier
    if (!locale) return 'ja'
    // 'ja_JP' → 'ja', 'zh_CN' → 'zh-CN'
    const normalized = locale.replace('_', '-')
    return normalized.startsWith('zh') ? normalized : normalized.split('-')[0]
  } catch {
    return 'ja'
  }
}

export type LoginResult = { jwt: string; email: string }

async function performOAuthLogin(
  config: AuthConfig,
  extraParams: Record<string, string> = {},
): Promise<LoginResult> {
  const region    = extractRegion(config.apiUrl)
  const discovery = buildDiscovery(config.cognitoDomain, region)
  const lang      = getDeviceLanguage()

  const request = new AuthSession.AuthRequest({
    clientId:     config.clientId,
    scopes:       ['openid', 'email', 'profile'],
    redirectUri:  REDIRECT_URI,
    responseType: AuthSession.ResponseType.Code,
    usePKCE:      true,
    extraParams:  { lang, ...extraParams },
  })

  const result = await request.promptAsync(discovery)

  if (result.type === 'cancel') throw new Error('ログインがキャンセルされました')
  if (result.type !== 'success') throw new Error('ログインに失敗しました')

  const tokenResult = await AuthSession.exchangeCodeAsync(
    {
      clientId:    config.clientId,
      code:        result.params.code,
      redirectUri: REDIRECT_URI,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    discovery,
  )

  const idToken = tokenResult.idToken
  if (!idToken) throw new Error('ID トークンが取得できませんでした')

  const payload = parseJwt(idToken)
  const email   = (payload.email as string) || (payload['cognito:username'] as string) || ''
  const exp     = (payload.exp as number) * 1000

  await Storage.setJwt(idToken, exp, tokenResult.refreshToken ?? undefined)
  return { jwt: idToken, email }
}

export async function login(config: AuthConfig): Promise<LoginResult> {
  return performOAuthLogin(config)
}

/**
 * Sign in with Apple 経由で Cognito にログインする。
 * Cognito の authorize エンドポイントに identity_provider=SignInWithApple を渡し、
 * Apple のサインイン画面に直接リダイレクトする。
 */
export async function loginWithApple(config: AuthConfig): Promise<LoginResult> {
  return performOAuthLogin(config, { identity_provider: 'SignInWithApple' })
}

/**
 * refreshToken を使って idToken を再取得する。
 * ユーザ操作不要で、バックグラウンドからも呼び出し可能。
 */
export async function refreshTokens(): Promise<string | null> {
  const [config, refreshToken] = await Promise.all([
    Storage.getAuthConfig(),
    Storage.getRefreshToken(),
  ])
  if (!config || !refreshToken) return null

  const region    = extractRegion(config.apiUrl)
  const discovery = buildDiscovery(config.cognitoDomain, region)

  const res = await AuthSession.refreshAsync(
    { clientId: config.clientId, refreshToken },
    discovery,
  )

  const idToken = res.idToken
  if (!idToken) return null

  const payload = parseJwt(idToken)
  const exp     = (payload.exp as number) * 1000

  await Storage.setJwt(idToken, exp, res.refreshToken ?? undefined)
  return idToken
}

export async function logout(): Promise<void> {
  const config = await Storage.getAuthConfig()
  await Storage.clearJwt()

  // Cognito のセッション（ブラウザ Cookie）を破棄する
  // これをしないと次回ログイン時に自動ログインされてしまう
  if (config) {
    const region = extractRegion(config.apiUrl)
    const logoutUrl =
      `https://${config.cognitoDomain}.auth.${region}.amazoncognito.com/logout` +
      `?client_id=${config.clientId}` +
      `&logout_uri=${encodeURIComponent(LOGOUT_URI)}`
    await WebBrowser.openAuthSessionAsync(logoutUrl, LOGOUT_URI).catch(() => {})
  }
}
