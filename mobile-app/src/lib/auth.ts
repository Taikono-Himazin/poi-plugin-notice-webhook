import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { Storage, AuthConfig } from './storage'

WebBrowser.maybeCompleteAuthSession()

// スタンドアロンビルドでは poi-notice://auth、
// Expo Go 開発時は exp://... が自動で使われる
const REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: 'poi-notice',
  path:   'auth',
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

export type LoginResult = { jwt: string; email: string }

export async function login(config: AuthConfig): Promise<LoginResult> {
  const region    = extractRegion(config.apiUrl)
  const discovery = buildDiscovery(config.cognitoDomain, region)

  const request = new AuthSession.AuthRequest({
    clientId:     config.clientId,
    scopes:       ['openid', 'email', 'profile'],
    redirectUri:  REDIRECT_URI,
    responseType: AuthSession.ResponseType.Code,
    usePKCE:      true,
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

  await Storage.setJwt(idToken, exp)
  return { jwt: idToken, email }
}

export async function logout(): Promise<void> {
  await Storage.clearJwt()
}
