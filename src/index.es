import React, { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { FormGroup, FormControl, ControlLabel, Button, Checkbox, HelpBlock, Radio } from 'react-bootstrap';
import axios from 'axios';
import fs from 'fs';
import http from 'http';
import pathModule from 'path';
import { isJwtExpired, extractRegion } from './lib/jwt';
import { NOTIFY_COLORS, getColor, buildGenericPayload, buildDiscordPayload, buildSlackPayload } from './lib/payloads';
import { extractTimersFromBody as _extractTimersFromBody } from './lib/timers';

const PLUGIN_KEY = 'poi-plugin-notice-webhook';

// ---- i18n ----
// poi は i18next を使用。window.i18n[PLUGIN_KEY].fixedT で翻訳・補間を行う
const t = (key, opts) => {
  try {
    const ns = window.i18n?.[PLUGIN_KEY];
    if (!ns) return key;
    if (typeof ns.fixedT === 'function') return ns.fixedT(key, opts) ?? key;
    if (typeof ns.__ === 'function') return ns.__(key) ?? key;
  } catch (_) {}
  return key;
};

// ---- config ----
const getConfig = (key, def) => window.config.get(`plugin.${PLUGIN_KEY}.${key}`, def);
const setConfig = (key, val) => window.config.set(`plugin.${PLUGIN_KEY}.${key}`, val);

// ---- CDK Outputs 読み込み ----
// cdk deploy 後に src/aws-outputs.json へコピーされるファイルを読む
const loadAwsOutputs = () => {
  try {
    const filePath = pathModule.join(__dirname, 'aws-outputs.json');
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    // 形式: { "PoiWebhookStack": { "ApiUrl": "...", "UserPoolClientId": "...", "CognitoDomain": "..." } }
    const stack = json['PoiWebhookStack'] || Object.values(json)[0] || {};
    const apiUrl = (stack.ApiUrl || '').replace(/\/$/, '');
    const clientId = stack.UserPoolClientId || '';
    const cognitoDomain = stack.CognitoDomain || '';
    return apiUrl || clientId ? { apiUrl, clientId, cognitoDomain } : null;
  } catch (_) {
    return null;
  }
};

// ---- Cognito Managed Login OAuth フロー ----
const OAUTH_PORT = 17890;
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`;
let _oauthServer = null;
let _oauthCallbacks = null;

const startOAuthFlow = (cognitoDomain, region, clientId, onSuccess, onError) => {
  if (_oauthServer) {
    try {
      _oauthServer.close();
    } catch (_) {}
    _oauthServer = null;
  }
  _oauthCallbacks = { onSuccess, onError };

  _oauthServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${OAUTH_PORT}`);
    if (url.pathname !== '/callback') {
      res.writeHead(404);
      res.end();
      return;
    }

    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<html><body><script>window.close()</script><p>ログイン完了。このウィンドウを閉じてください。</p></body></html>',
    );

    _oauthServer.close();
    _oauthServer = null;

    if (error || !code) {
      _oauthCallbacks?.onError(error || 'No code received');
      return;
    }
    exchangeCodeForTokens(cognitoDomain, region, clientId, code)
      .then(({ idToken, refreshToken, email }) => _oauthCallbacks?.onSuccess(idToken, refreshToken, email))
      .catch((e) => _oauthCallbacks?.onError(e.message));
  });

  _oauthServer.listen(OAUTH_PORT, '127.0.0.1', () => {
    // poi の表示言語を Cognito lang パラメータに変換
    // window.language は 'ja-JP' / 'en-US' / 'zh-CN' / 'zh-TW' などの形式
    const poiLang = window.language || 'ja-JP';
    const cognitoLang = poiLang.startsWith('zh') ? poiLang : poiLang.split('-')[0];

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: REDIRECT_URI,
      lang: cognitoLang,
      prompt: 'login',
    });
    window.open(
      `https://${cognitoDomain}.auth.${region}.amazoncognito.com/oauth2/authorize?${params}`,
      'cognito-login',
      'width=500,height=700,menubar=no,toolbar=no',
    );
  });
  _oauthServer.on('error', (e) => onError(`Port ${OAUTH_PORT} が使用中です: ${e.message}`));
};

const exchangeCodeForTokens = async (cognitoDomain, region, clientId, code) => {
  const res = await axios.post(
    `https://${cognitoDomain}.auth.${region}.amazoncognito.com/oauth2/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: REDIRECT_URI,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  const idToken = res.data.id_token;
  const refreshToken = res.data.refresh_token || '';
  const payload = JSON.parse(atob(idToken.split('.')[1]));
  const email = payload.email || payload['cognito:username'] || '';
  return { idToken, refreshToken, email };
};

const refreshIdToken = async (cognitoDomain, region, clientId, refreshToken) => {
  const res = await axios.post(
    `https://${cognitoDomain}.auth.${region}.amazoncognito.com/oauth2/token`,
    new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  return res.data.id_token;
};

// JWT が期限切れなら自動リフレッシュし、新しい JWT を返す
const ensureValidJwt = async () => {
  let jwt = getConfig('awsJwt', '');
  if (!jwt) return null;
  if (!isJwtExpired(jwt)) return jwt;
  const refreshToken = getConfig('awsRefreshToken', '');
  if (!refreshToken) return null;
  try {
    const cognitoDomain = getConfig('awsCognitoDomain', '');
    const apiUrl = getConfig('awsApiUrl', '');
    const clientId = getConfig('awsClientId', '');
    const region = extractRegion(apiUrl);
    const newJwt = await refreshIdToken(cognitoDomain, region, clientId, refreshToken);
    setConfig('awsJwt', newJwt);
    return newJwt;
  } catch (e) {
    console.error(`[${PLUGIN_KEY}] JWT リフレッシュエラー:`, e.message);
    return null;
  }
};

// ---- タイマー同期 ----
// game.response の detail 構造: { method, path, body, postBody, time }

// lib/timers.js に window.getStore を注入するラッパー
function extractTimersFromBody(path, body) {
  return _extractTimersFromBody(path, body, window.getStore);
}

// デバウンス用タイマー
let _syncDebounceTimer = null;

// クライアント側タイマー（直接送信モード用）
const _clientTimers = new Map();

// 直接送信モード用: setTimeout でタイマー通知をスケジュール
function scheduleDirectNotifications(timers) {
  // 既存タイマーをすべてキャンセル
  for (const id of _clientTimers.values()) clearTimeout(id);
  _clientTimers.clear();

  if (getConfig('deliveryMode', 'direct') !== 'direct') return;

  if (!getConfig('timerExpedition', true) && !getConfig('timerRepair', true) && !getConfig('timerConstruction', true))
    return;
  const webhookType = getConfig('webhookType', 'discord');
  const webhookUrl = getConfig('webhookUrl', '');
  if (!webhookUrl) return;

  const timerEnabled = {
    expedition: getConfig('timerExpedition', true),
    repair: getConfig('timerRepair', true),
    construction: getConfig('timerConstruction', true),
  };

  for (const timer of timers) {
    const { type, slot, completesAt, message } = timer;
    if (timerEnabled[type] === false) continue;
    const beforeMin = getConfig('notifyBeforeMinutes', 1);
    const msLeft = new Date(completesAt).getTime() - Date.now() - beforeMin * 60 * 1000;
    if (msLeft <= 0) continue;
    const key = `${type}#${slot}`;
    const id = setTimeout(() => {
      _clientTimers.delete(key);
      const sender = SENDERS[webhookType];
      if (sender) {
        sender(webhookUrl, message, { type }).catch((e) =>
          console.error(`[${PLUGIN_KEY}] タイマー通知エラー:`, e.message),
        );
      }
    }, msLeft);
    _clientTimers.set(key, id);
  }
}

// AWS へタイマー状態を同期する
async function syncTimers(timers) {
  if (getConfig('deliveryMode', 'direct') !== 'aws') return;
  const awsApiUrl = getConfig('awsApiUrl', '');
  const jwt = await ensureValidJwt();
  if (!awsApiUrl || !jwt) return;

  const enabled = {
    expedition: getConfig('timerExpedition', true),
    repair: getConfig('timerRepair', true),
    construction: getConfig('timerConstruction', true),
  };

  const notifyBeforeMinutes = getConfig('notifyBeforeMinutes', 1);
  axios
    .put(
      `${awsApiUrl}/timers`,
      { timers, enabled, notifyBeforeMinutes },
      {
        headers: { Authorization: `Bearer ${jwt}` },
      },
    )
    .catch((e) => {
      console.error(`[${PLUGIN_KEY}] タイマー同期エラー:`, e.message);
      reportError(e, { action: 'syncTimers' });
    });
}

// ゲームイベントハンドラ
const TIMER_PATHS = new Set([
  '/kcsapi/api_port/port',
  '/kcsapi/api_get_member/deck',
  '/kcsapi/api_get_member/ndock',
  '/kcsapi/api_get_member/kdock',
  '/kcsapi/api_req_mission/start',
  '/kcsapi/api_req_mission/result',
  '/kcsapi/api_req_nyukyo/start',
  '/kcsapi/api_req_nyukyo/speedchange',
  '/kcsapi/api_req_kousyou/createship',
  '/kcsapi/api_req_kousyou/getship',
]);

function handleGameResponse(e) {
  const mode = getConfig('deliveryMode', 'direct');
  // AWS モードのとき: 設定が揃っていなければスキップ
  if (mode === 'aws' && (!getConfig('awsApiUrl', '') || !getConfig('awsJwt', ''))) return;
  const { path, body } = e.detail || {};
  if (!path || !TIMER_PATHS.has(path)) return;

  // port API は完全な状態を持つのでそのまま同期
  // その他は port 後の部分更新なので、全体を再取得して同期する
  // デバウンス: 連続イベントをまとめる
  clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(() => {
    if (path === '/kcsapi/api_port/port') {
      const timers = extractTimersFromBody(path, body);
      if (mode === 'aws') syncTimers(timers);
      else scheduleDirectNotifications(timers);
    } else {
      // 部分更新: store から現在の全状態を取得して同期
      syncFromStore();
    }
  }, 1000);
}

// Immutable.js List/Map またはプレーン JS を配列に正規化
const toPlainArray = (v) => {
  if (!v) return [];
  if (typeof v.toJS === 'function') return v.toJS();
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return Object.values(v);
  return [];
};

// Redux store から現在のタイマー状態を取得して同期
function syncFromStore() {
  try {
    // poi の window.getStore(path) で状態を取得
    // Immutable.js で管理されている場合は toPlainArray でプレーン JS に変換
    const deckPort = toPlainArray(window.getStore('info.fleets'));
    const ndock = toPlainArray(window.getStore('info.repairs'));
    const kdock = toPlainArray(window.getStore('info.constructions'));

    // store の形式は API 形式と異なる場合があるため、
    // api_port/port と同じ形式に変換して extractTimersFromBody を流用
    const portBody = {
      api_deck_port: deckPort,
      api_ndock: ndock,
      api_kdock: kdock,
    };
    const timers = extractTimersFromBody('/kcsapi/api_port/port', portBody);
    const mode = getConfig('deliveryMode', 'direct');
    if (mode === 'aws') syncTimers(timers);
    else scheduleDirectNotifications(timers);
  } catch (e) {
    console.error(`[${PLUGIN_KEY}] store からのタイマー取得エラー:`, e.message);
    reportError(e, { action: 'syncFromStore' });
  }
}

// ---- エラー報告 ----
const _reportedErrors = new Set();
function reportError(err, ctx = {}) {
  const apiUrl = getConfig('awsApiUrl', '');
  if (!apiUrl) return;
  // 同じメッセージの重複送信を抑制（セッション内）
  const key = (err.message || String(err)).slice(0, 200);
  if (_reportedErrors.has(key)) return;
  _reportedErrors.add(key);
  axios
    .post(`${apiUrl}/errors`, {
      source: 'poi-plugin',
      level: 'error',
      message: key,
      stack: (err.stack || '').slice(0, 5000),
      context: { pluginVersion: '1.0.3', ...ctx },
    })
    .catch(() => {});
}

// ---- 送信処理 ----
const sendGeneric = (url, msg, options) => axios.post(url, buildGenericPayload(msg, options));

const sendDiscord = (url, msg, options) => axios.post(url, buildDiscordPayload(msg, options));

const sendSlack = (url, msg, options) => axios.post(url, buildSlackPayload(msg, options));

const SENDERS = {
  generic: (url, msg, options) => sendGeneric(url, msg, options),
  discord: (url, msg, options) => sendDiscord(url, msg, options),
  slack: (url, msg, options) => sendSlack(url, msg, options),
};

// ---- プラグインライフサイクル ----
let _originalNotify = null;

const _hookedNotify = (msg, options = {}) => {
  if (typeof _originalNotify === 'function') {
    _originalNotify(msg, options);
  }

  const timerExp = getConfig('timerExpedition', true);
  const timerRep = getConfig('timerRepair', true);
  const timerCon = getConfig('timerConstruction', true);
  if (!timerExp && !timerRep && !timerCon) return;

  // 遠征・入渠・建造以外の通知（戦闘終了など）は転送しない
  const type = options.type || '';
  const timerTypes = { expedition: 'timerExpedition', repair: 'timerRepair', construction: 'timerConstruction' };
  if (!timerTypes[type]) return;
  if (!getConfig(timerTypes[type], true)) return;

  const deliveryMode = getConfig('deliveryMode', 'direct');

  if (deliveryMode === 'aws') {
    const token = getConfig('awsToken', '');
    const awsApiUrl = getConfig('awsApiUrl', '');
    if (!awsApiUrl || !token) return;
    axios
      .post(`${awsApiUrl}/webhooks/${token}`, buildGenericPayload(msg, options))
      .catch((e) => console.error(`[${PLUGIN_KEY}] AWS 送信エラー:`, e.message));
    return;
  }

  // 直接送信モード
  const webhookType = getConfig('webhookType', 'discord');
  const webhookUrl = getConfig('webhookUrl', '');
  if (!webhookUrl) return;
  const sender = SENDERS[webhookType];
  if (sender) {
    sender(webhookUrl, msg, options).catch((e) => console.error(`[${PLUGIN_KEY}] Webhook 送信エラー:`, e.message));
  }
};

export const pluginDidLoad = () => {
  _originalNotify = window.notify ?? null;
  try {
    Object.defineProperty(window, 'notify', {
      get() {
        return _hookedNotify;
      },
      set(fn) {
        _originalNotify = fn;
      },
      configurable: true,
    });
  } catch (e) {
    console.error(`[${PLUGIN_KEY}] defineProperty failed:`, e.message);
    window.notify = _hookedNotify;
  }

  // ゲームイベントを購読してタイマーを同期
  window.addEventListener('game.response', handleGameResponse);

  // 起動時に現在のタイマー状態を同期（store が準備されるまで少し待つ）
  setTimeout(syncFromStore, 500);
};

export const pluginWillUnload = () => {
  window.removeEventListener('game.response', handleGameResponse);
  clearTimeout(_syncDebounceTimer);
  for (const id of _clientTimers.values()) clearTimeout(id);
  _clientTimers.clear();

  try {
    Object.defineProperty(window, 'notify', {
      value: _originalNotify,
      writable: true,
      configurable: true,
    });
  } catch (_) {
    window.notify = _originalNotify;
  }
  _originalNotify = null;
};

// ---- 電探アイコン ----
// アイコン出典: https://www.pixiv.net/artworks/39534914
const _radarIconPath = pathModule.join(__dirname, 'radar-icon.png').replace(/\\/g, '/');
const radarIconSrc = _radarIconPath.startsWith('/') ? `file://${_radarIconPath}` : `file:///${_radarIconPath}`;
const RadarIcon = ({ size = 14, style }) => (
  <img
    src={radarIconSrc}
    width={size}
    height={size}
    alt="電探"
    style={{ display: 'inline-block', verticalAlign: 'middle', imageRendering: 'auto', ...style }}
  />
);

// ---- 設定 UI ----
const WEBHOOK_TYPES = ['discord', 'slack'];

const getTypeLabel = (type) => t(`webhookType${type.charAt(0).toUpperCase() + type.slice(1)}`);

const URL_PLACEHOLDERS = {
  discord: 'https://discord.com/api/webhooks/...',
  slack: 'https://hooks.slack.com/services/...',
};

const URL_HINTS = {
  discord: 'hintDiscord',
  slack: 'hintSlack',
};

const OFFICIAL_HELP_URLS = {
  discord: 'https://support.discord.com/hc/articles/228383668',
  slack: 'https://api.slack.com/messaging/webhooks',
};

// ---- AWS Managed Login コンポーネント ----
const AwsManagedLogin = ({ apiUrl, clientId, cognitoDomain, jwt, savedEmail, onLoginSuccess, onLogout }) => {
  const [waiting, setWaiting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const region = extractRegion(apiUrl);

  const handleLogin = () => {
    setWaiting(true);
    setStatusMsg(t('awsLoginWaiting'));
    startOAuthFlow(
      cognitoDomain,
      region,
      clientId,
      (jwt, refreshToken, email) => {
        onLoginSuccess(jwt, refreshToken, email);
        setWaiting(false);
        setStatusMsg('');
      },
      (errMsg) => {
        setWaiting(false);
        setStatusMsg(errMsg);
      },
    );
  };

  const handleCancelLogin = () => {
    if (_oauthServer) {
      try {
        _oauthServer.close();
      } catch (_) {}
      _oauthServer = null;
    }
    _oauthCallbacks = null;
    setWaiting(false);
    setStatusMsg('');
  };

  if (jwt) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '12px' }}>{t('awsLoggedInAs', { email: savedEmail })}</span>
        <Button bsSize="xs" onClick={onLogout}>
          {t('awsLogout')}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: '12px', color: '#aaa', marginBottom: 4 }}>{t('awsLoginGuide1')}</p>
      <p style={{ fontSize: '12px', color: '#5cb85c', marginBottom: 8 }}>{t('awsLoginGuide2')}</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button bsSize="xs" bsStyle="primary" onClick={handleLogin} disabled={waiting}>
          {waiting ? t('awsLoginWaiting') : t('awsLoginWithCognito')}
        </Button>
        {waiting && (
          <Button bsSize="xs" bsStyle="default" onClick={handleCancelLogin}>
            {t('awsLoginCancel')}
          </Button>
        )}
      </div>
      {statusMsg && !waiting && (
        <p style={{ fontSize: '12px', color: '#d9534f', marginTop: 6, marginBottom: 0 }}>{statusMsg}</p>
      )}
      <p style={{ fontSize: '11px', color: '#888', marginTop: 6, marginBottom: 0 }}>{t('awsLoginNote')}</p>
    </div>
  );
};

// ---- AWS 配信先設定コンポーネント ----
const AwsDeliveryConfig = forwardRef(({ apiUrl, jwt }, ref) => {
  const [type, setType] = useState('generic');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    axios
      .get(`${apiUrl}/account/config`, { headers: { Authorization: `Bearer ${jwt}` } })
      .then((res) => {
        if (res.data.webhookType) setType(res.data.webhookType);
        if (res.data.webhookUrl) setUrl(res.data.webhookUrl);
      })
      .catch(() => {});
  }, [apiUrl, jwt]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatusMsg('');
    try {
      await axios.put(
        `${apiUrl}/account/config`,
        { webhookType: type, webhookUrl: url },
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      setStatusMsg(t('awsDeliveryConfigSaved'));
      setIsError(false);
    } catch (e) {
      setStatusMsg(e.response?.data?.error || e.message);
      setIsError(true);
    } finally {
      setSaving(false);
    }
  }, [apiUrl, jwt, type, url]);

  useImperativeHandle(ref, () => ({ save: handleSave, saving }), [handleSave, saving]);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <strong style={{ fontSize: '12px' }}>{t('awsDeliveryConfigSection')}</strong>
        <span style={{ fontSize: '11px', color: '#888' }}>{t('awsDeliveryConfigCloud')}</span>
      </div>
      <FormGroup style={{ marginTop: 6 }}>
        <div>
          <Radio
            name="awsDeliveryType"
            value="none"
            checked={type === 'none'}
            onChange={(e) => setType(e.target.value)}
            inline
            style={{ marginRight: 12 }}
          >
            なし
          </Radio>
          {WEBHOOK_TYPES.map((wt) => (
            <Radio
              key={wt}
              name="awsDeliveryType"
              value={wt}
              checked={type === wt}
              onChange={(e) => setType(e.target.value)}
              inline
              style={{ marginRight: 12 }}
            >
              {getTypeLabel(wt)}
            </Radio>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: '#aaa' }}>
          「なし」を選択してもスマホアプリには通知が届きます。{' '}
          <a href="#" target="_blank" rel="noreferrer" style={{ color: '#5865f2' }}>
            スマホアプリはこちら
          </a>
        </p>
      </FormGroup>
      {type !== 'none' && (
        <FormGroup>
          <ControlLabel>{t('urlLabel')}</ControlLabel>
          <FormControl
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={URL_PLACEHOLDERS[type] || 'https://example.com/webhook'}
          />
          {URL_HINTS[type] && (
            <HelpBlock>
              {t(URL_HINTS[type])}
              {OFFICIAL_HELP_URLS[type] && (
                <>
                  {' '}
                  —{' '}
                  <a href={OFFICIAL_HELP_URLS[type]} target="_blank" rel="noreferrer">
                    {t('officialHelp')}
                  </a>
                </>
              )}
            </HelpBlock>
          )}
        </FormGroup>
      )}

      {statusMsg && (
        <p style={{ fontSize: '12px', color: isError ? '#d9534f' : '#5cb85c', marginBottom: 0 }}>{statusMsg}</p>
      )}
    </div>
  );
});

export const reactClass = () => {
  const [deliveryMode, setDeliveryMode] = useState(() => getConfig('deliveryMode', 'direct'));
  const [webhookUrl, setWebhookUrl] = useState(() => getConfig('webhookUrl', ''));
  const [webhookType, setWebhookType] = useState(() => {
    const t = getConfig('webhookType', 'discord');
    return t === 'generic' ? 'discord' : t;
  });
  const [awsApiUrl, setAwsApiUrl] = useState(() => getConfig('awsApiUrl', ''));
  const [awsClientId, setAwsClientId] = useState(() => getConfig('awsClientId', ''));
  const [awsCognitoDomain, setAwsCognitoDomain] = useState(() => getConfig('awsCognitoDomain', ''));
  const [awsToken, setAwsToken] = useState(() => getConfig('awsToken', ''));
  const [awsJwt, setAwsJwt] = useState(() => {
    const saved = getConfig('awsJwt', '');
    return saved && !isJwtExpired(saved) ? saved : null;
  });

  // 起動時: JWT が期限切れでもリフレッシュトークンがあれば自動リフレッシュ
  useEffect(() => {
    if (awsJwt) return; // 既に有効な JWT がある
    const refreshToken = getConfig('awsRefreshToken', '');
    if (!refreshToken) return;
    const cognitoDomain = getConfig('awsCognitoDomain', '');
    const apiUrl = getConfig('awsApiUrl', '');
    const clientId = getConfig('awsClientId', '');
    if (!cognitoDomain || !clientId) return;
    const region = extractRegion(apiUrl);
    refreshIdToken(cognitoDomain, region, clientId, refreshToken)
      .then((newJwt) => {
        setAwsJwt(newJwt);
        setConfig('awsJwt', newJwt);
      })
      .catch((e) => {
        console.error(`[${PLUGIN_KEY}] 起動時 JWT リフレッシュエラー:`, e.message);
        // リフレッシュトークンが無効化されている場合はクリア
        setConfig('awsJwt', '');
        setConfig('awsRefreshToken', '');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [awsSavedEmail, setAwsSavedEmail] = useState(() => getConfig('awsSavedEmail', ''));
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [forceSyncing, setForceSyncing] = useState(false);
  const [forceSyncResult, setForceSyncResult] = useState(null);
  const [configOpen, setConfigOpen] = useState(true);
  const deliveryConfigRef = useRef(null);
  // タイマー同期
  const [timerExpedition, setTimerExpedition] = useState(() => getConfig('timerExpedition', true));
  const [timerRepair, setTimerRepair] = useState(() => getConfig('timerRepair', true));
  const [timerConstruction, setTimerConstruction] = useState(() => getConfig('timerConstruction', true));
  const [notifyBeforeMinutes, setNotifyBeforeMinutes] = useState(() => getConfig('notifyBeforeMinutes', 1));
  // 起動時: aws-outputs.json から API URL・クライアント ID・Cognito ドメインを読み込む
  // ファイルが存在する場合は常に最新値で上書きする（再デプロイ後に自動反映）
  useEffect(() => {
    const data = loadAwsOutputs();
    if (!data) return;
    if (data.apiUrl) {
      setAwsApiUrl(data.apiUrl);
      setConfig('awsApiUrl', data.apiUrl);
    }
    if (data.clientId) {
      setAwsClientId(data.clientId);
      setConfig('awsClientId', data.clientId);
    }
    if (data.cognitoDomain) {
      setAwsCognitoDomain(data.cognitoDomain);
      setConfig('awsCognitoDomain', data.cognitoDomain);
    }
  }, []);

  // ログイン後: Webhook トークンを自動取得または新規作成
  useEffect(() => {
    if (!awsJwt || !awsApiUrl) return;
    (async () => {
      try {
        const res = await axios.get(`${awsApiUrl}/tokens`, {
          headers: { Authorization: `Bearer ${awsJwt}` },
        });
        const items = Array.isArray(res.data) ? res.data : (res.data?.tokens ?? []);
        if (items.length > 0) {
          const token = items[0].token;
          setAwsToken(token);
          setConfig('awsToken', token);
        } else {
          const res2 = await axios.post(
            `${awsApiUrl}/tokens`,
            { type: 'generic' },
            {
              headers: { Authorization: `Bearer ${awsJwt}` },
            },
          );
          if (res2.data?.token) {
            setAwsToken(res2.data.token);
            setConfig('awsToken', res2.data.token);
          }
        }
      } catch (e) {
        console.error(`[${PLUGIN_KEY}] トークン自動設定エラー:`, e.message);
      }
    })();
  }, [awsJwt, awsApiUrl]);

  const isAws = deliveryMode === 'aws';
  const isValidUrl = webhookUrl === '' || /^https?:\/\/.+/.test(webhookUrl);
  const canSave = isValidUrl && webhookUrl !== '';

  const handleDeliveryModeChange = useCallback((e) => {
    const val = e.target.value;
    setDeliveryMode(val);
    setConfig('deliveryMode', val);
    setSaved(false);
  }, []);

  const handleTypeChange = useCallback((e) => {
    const val = e.target.value;
    setWebhookType(val);
    setConfig('webhookType', val);
    setSaved(false);
  }, []);

  const handleUrlChange = useCallback((e) => {
    setWebhookUrl(e.target.value);
    setSaved(false);
  }, []);

  const handleTimerExpeditionChange = useCallback((e) => {
    const val = e.target.checked;
    setTimerExpedition(val);
    setConfig('timerExpedition', val);
  }, []);

  const handleTimerRepairChange = useCallback((e) => {
    const val = e.target.checked;
    setTimerRepair(val);
    setConfig('timerRepair', val);
  }, []);

  const handleTimerConstructionChange = useCallback((e) => {
    const val = e.target.checked;
    setTimerConstruction(val);
    setConfig('timerConstruction', val);
  }, []);

  const handleNotifyBeforeMinutesChange = useCallback((e) => {
    const val = Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0));
    setNotifyBeforeMinutes(val);
    setConfig('notifyBeforeMinutes', val);
  }, []);

  const handleLoginSuccess = useCallback((jwt, refreshToken, email) => {
    setAwsJwt(jwt);
    setAwsSavedEmail(email);
    setConfig('awsJwt', jwt);
    setConfig('awsRefreshToken', refreshToken);
    setConfig('awsSavedEmail', email);
  }, []);

  const handleLogout = useCallback(() => {
    // ログアウト前にサーバー側の通知予定をキャンセル
    const currentJwt = getConfig('awsJwt', '');
    const currentApiUrl = getConfig('awsApiUrl', '');
    if (currentJwt && currentApiUrl) {
      axios
        .put(
          `${currentApiUrl}/timers`,
          { timers: [], enabled: { expedition: false, repair: false, construction: false } },
          { headers: { Authorization: `Bearer ${currentJwt}` } },
        )
        .catch(() => {});
    }
    setAwsJwt(null);
    setConfig('awsJwt', '');
    setConfig('awsRefreshToken', '');
  }, []);

  const handleSave = useCallback(() => {
    setConfig('webhookUrl', webhookUrl);
    setSaved(true);
    if (typeof window.success === 'function') window.success(t('successSave'));
  }, [webhookUrl]);

  const handleTest = useCallback(async () => {
    const mode = getConfig('deliveryMode', 'direct');
    const testOptions = { type: 'default', title: 'poi 通知テスト' };

    if (mode === 'aws') {
      const token = getConfig('awsToken', '');
      const apiUrl = getConfig('awsApiUrl', '');
      if (!apiUrl || !token) {
        if (typeof window.error === 'function') window.error(t('errNoUrl'));
        return;
      }
      setTesting(true);
      try {
        await axios.post(`${apiUrl}/webhooks/${token}`, buildGenericPayload(t('testMessage'), testOptions));
        if (typeof window.success === 'function') window.success(t('successTest'));
      } catch (e) {
        if (typeof window.error === 'function') window.error(t('failTest', { error: e.message }));
      } finally {
        setTesting(false);
      }
      return;
    }

    const currentType = getConfig('webhookType', 'discord');
    const currentUrl = getConfig('webhookUrl', '');
    if (!currentUrl) {
      if (typeof window.error === 'function') window.error(t('errNoUrl'));
      return;
    }
    setTesting(true);
    const sender = SENDERS[currentType];
    try {
      if (sender) await sender(currentUrl, t('testMessage'), testOptions);
      if (typeof window.success === 'function') window.success(t('successTest'));
    } catch (e) {
      if (typeof window.error === 'function') window.error(t('failTest', { error: e.message }));
    } finally {
      setTesting(false);
    }
  }, []);

  const handleForceSync = useCallback(() => {
    setForceSyncing(true);
    setForceSyncResult(null);
    try {
      syncFromStore();
      setForceSyncResult('ok');
      setTimeout(() => setForceSyncResult(null), 10_000);
    } catch (_) {
      setForceSyncResult('error');
    } finally {
      setForceSyncing(false);
    }
  }, []);

  return (
    <div
      lang="ja"
      style={{
        padding: '16px',
        maxWidth: '600px',
        fontFamily:
          '"Yu Gothic UI", "Yu Gothic", "Meiryo UI", "Meiryo", "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif',
      }}
    >
      <h4>{t('pluginTitle')}</h4>
      <p style={{ color: '#888', fontSize: '12px', marginBottom: 12 }}>{t('pluginDesc')}</p>

      {/* 通知する項目 */}
      <FormGroup>
        <ControlLabel>{t('timerNotifyLabel')}</ControlLabel>
        <div>
          <Checkbox checked={timerExpedition} onChange={handleTimerExpeditionChange} inline>
            {t('timerExpedition')}
          </Checkbox>
          <Checkbox checked={timerRepair} onChange={handleTimerRepairChange} inline>
            {t('timerRepair')}
          </Checkbox>
          <Checkbox checked={timerConstruction} onChange={handleTimerConstructionChange} inline>
            {t('timerConstruction')}
          </Checkbox>
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '12px' }}>{t('notifyBeforeLabel')}</span>
          <FormControl
            type="number"
            min={0}
            max={60}
            value={notifyBeforeMinutes}
            onChange={handleNotifyBeforeMinutesChange}
            style={{ width: 60, display: 'inline-block' }}
          />
          <span style={{ fontSize: '12px' }}>{t('notifyBeforeUnit')}</span>
        </div>
      </FormGroup>

      {/* 折りたたみ設定パネル */}
      <div style={{ border: '1px solid #555', borderRadius: 4, marginBottom: 16 }}>
        {/* ヘッダー（クリックで開閉） */}
        <div
          onClick={() => setConfigOpen((v) => !v)}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#3a3a3a',
            borderRadius: configOpen ? '4px 4px 0 0' : 4,
            userSelect: 'none',
          }}
        >
          <strong style={{ fontSize: '13px' }}>{t('pluginSetting')}</strong>
          <span style={{ fontSize: '11px', color: '#aaa' }}>{configOpen ? '▲' : '▼'}</span>
        </div>

        {configOpen && (
          <div style={{ padding: '12px 16px' }}>
            {/* 1. 送信モード */}
            <FormGroup>
              <ControlLabel>{t('deliveryModeLabel')}</ControlLabel>
              <div>
                <Radio
                  name="deliveryMode"
                  value="direct"
                  checked={!isAws}
                  onChange={handleDeliveryModeChange}
                  inline
                  style={{ marginRight: '16px' }}
                >
                  {t('deliveryModeDirect')}
                </Radio>
                <Radio name="deliveryMode" value="aws" checked={isAws} onChange={handleDeliveryModeChange} inline>
                  {t('deliveryModeAws')}
                </Radio>
              </div>
              {isAws && <HelpBlock style={{ color: '#e6a817', marginTop: 4 }}>{t('deliveryModeAwsNote')}</HelpBlock>}
            </FormGroup>

            {/* 2. アカウント（クラウドモード） */}
            {isAws && (
              <FormGroup>
                <ControlLabel>{t('awsAccountSection')}</ControlLabel>
                <div style={{ marginTop: 4 }}>
                  {awsApiUrl && awsClientId && awsCognitoDomain ? (
                    <AwsManagedLogin
                      apiUrl={awsApiUrl}
                      clientId={awsClientId}
                      cognitoDomain={awsCognitoDomain}
                      jwt={awsJwt}
                      savedEmail={awsSavedEmail}
                      onLoginSuccess={handleLoginSuccess}
                      onLogout={handleLogout}
                    />
                  ) : (
                    <p style={{ fontSize: '12px', color: '#d9534f', margin: 0 }}>{t('awsNotConfigured')}</p>
                  )}
                </div>
              </FormGroup>
            )}

            {/* 3. 配信先設定 */}
            {isAws ? (
              awsJwt &&
              awsApiUrl && (
                <>
                  <FormGroup>
                    <AwsDeliveryConfig ref={deliveryConfigRef} apiUrl={awsApiUrl} jwt={awsJwt} />
                  </FormGroup>
                </>
              )
            ) : (
              <>
                <FormGroup>
                  <ControlLabel>{t('formatLabel')}</ControlLabel>
                  <div>
                    {WEBHOOK_TYPES.map((type) => (
                      <Radio
                        key={type}
                        name="webhookType"
                        value={type}
                        checked={webhookType === type}
                        onChange={handleTypeChange}
                        inline
                        style={{ marginRight: '16px' }}
                      >
                        {getTypeLabel(type)}
                      </Radio>
                    ))}
                  </div>
                </FormGroup>

                <FormGroup validationState={isValidUrl ? null : 'error'}>
                  <ControlLabel>{t('urlLabel')}</ControlLabel>
                  <FormControl
                    type="url"
                    placeholder={URL_PLACEHOLDERS[webhookType] ?? 'https://example.com/webhook'}
                    value={webhookUrl}
                    onChange={handleUrlChange}
                  />
                  {!isValidUrl && <HelpBlock>{t('urlInvalid')}</HelpBlock>}
                  {URL_HINTS[webhookType] && (
                    <HelpBlock>
                      {t(URL_HINTS[webhookType])}
                      {OFFICIAL_HELP_URLS[webhookType] && (
                        <>
                          {' '}
                          —{' '}
                          <a href={OFFICIAL_HELP_URLS[webhookType]} target="_blank" rel="noreferrer">
                            {t('officialHelp')}
                          </a>
                        </>
                      )}
                    </HelpBlock>
                  )}
                </FormGroup>
              </>
            )}

            {/* 5. テスト送信 / 保存 */}
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              {!isAws ? (
                <Button bsStyle="primary" onClick={handleSave} disabled={!canSave}>
                  {saved ? t('saved') : t('save')}
                </Button>
              ) : (
                awsJwt &&
                awsApiUrl && (
                  <Button
                    bsStyle="primary"
                    onClick={() => deliveryConfigRef.current?.save()}
                    disabled={deliveryConfigRef.current?.saving}
                  >
                    {deliveryConfigRef.current?.saving ? t('awsDeliveryConfigSaving') : t('awsDeliveryConfigSave')}
                  </Button>
                )
              )}
              {(!isAws || awsJwt) && (
                <Button bsStyle="default" onClick={handleTest} disabled={testing}>
                  {testing ? t('testing') : t('test')}
                </Button>
              )}
              {isAws && awsJwt && (
                <Button bsStyle="default" onClick={handleForceSync} disabled={forceSyncing}>
                  {forceSyncing ? t('forceSyncing') : t('forceSync')}
                </Button>
              )}
              {isAws && awsJwt && forceSyncResult === 'ok' && (
                <span style={{ fontSize: '12px', color: '#5cb85c' }}>{t('forceSyncDone')}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* クラウド支援のお願い（設定パネル外） */}
      {isAws && awsJwt && (
        <p style={{ fontSize: '11px', color: '#888', marginTop: 8, marginBottom: 0 }}>
          {t('supportNote')}{' '}
          <a
            href="https://github.com/sponsors/Taikono-Himazin"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#ea4aaa' }}
          >
            {t('supportLink')}
          </a>
        </p>
      )}
    </div>
  );
};
