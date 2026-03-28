import AsyncStorage from '@react-native-async-storage/async-storage';

import { Storage, loadConfigFromOutputs } from '../storage';

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage as any)._resetStore();
});

describe('loadConfigFromOutputs', () => {
  it('aws-outputs.json が空の場合は null を返す', () => {
    // moduleNameMapper により aws-outputs.json は {} にマッピングされている
    const config = loadConfigFromOutputs();
    expect(config).toBeNull();
  });
});

describe('Storage.setJwt / getJwt / clearJwt', () => {
  it('JWT を保存・取得できる', async () => {
    await Storage.setJwt('token123', 9999999999999);
    const jwt = await Storage.getJwt();
    expect(jwt).toBe('token123');
  });

  it('refreshToken も一緒に保存できる', async () => {
    await Storage.setJwt('token123', 9999999999999, 'refresh-abc');
    const rt = await Storage.getRefreshToken();
    expect(rt).toBe('refresh-abc');
  });

  it('clearJwt で JWT・有効期限・refreshToken を削除する', async () => {
    await Storage.setJwt('token123', 9999999999999, 'refresh-abc');
    await Storage.clearJwt();
    expect(await Storage.getJwt()).toBeNull();
    expect(await Storage.getRefreshToken()).toBeNull();
  });
});

describe('Storage.isJwtValid', () => {
  it('有効期限内なら true', async () => {
    await Storage.setJwt('token', Date.now() + 300_000); // 5分後
    expect(await Storage.isJwtValid()).toBe(true);
  });

  it('有効期限が1分以内なら false（バッファあり）', async () => {
    await Storage.setJwt('token', Date.now() + 30_000); // 30秒後
    expect(await Storage.isJwtValid()).toBe(false);
  });

  it('JWT がなければ false', async () => {
    expect(await Storage.isJwtValid()).toBe(false);
  });
});

describe('Storage.AuthConfig', () => {
  const config = {
    apiUrl: 'https://api.example.com',
    clientId: 'client-123',
    cognitoDomain: 'my-domain',
  };

  it('保存・取得できる', async () => {
    await Storage.setAuthConfig(config);
    expect(await Storage.getAuthConfig()).toEqual(config);
  });

  it('未保存なら null', async () => {
    expect(await Storage.getAuthConfig()).toBeNull();
  });
});

describe('Storage.TimersCache', () => {
  const timers = [{ type: 'expedition' as const, slot: 1, completesAt: '2026-01-01T12:00:00Z', message: '遠征1' }];

  it('保存・取得できる', async () => {
    await Storage.setTimersCache(timers);
    expect(await Storage.getTimersCache()).toEqual(timers);
  });

  it('未保存なら空配列', async () => {
    expect(await Storage.getTimersCache()).toEqual([]);
  });
});

describe('Storage.NotifySettings', () => {
  it('デフォルトは全て true', async () => {
    const settings = await Storage.getNotifySettings();
    expect(settings).toEqual({ expedition: true, repair: true, construction: true });
  });

  it('保存・取得できる', async () => {
    const settings = { expedition: true, repair: false, construction: true };
    await Storage.setNotifySettings(settings);
    expect(await Storage.getNotifySettings()).toEqual(settings);
  });
});

describe('Storage.LastSync', () => {
  it('保存・取得できる', async () => {
    await Storage.setLastSync(1700000000000);
    expect(await Storage.getLastSync()).toBe(1700000000000);
  });

  it('未保存なら null', async () => {
    expect(await Storage.getLastSync()).toBeNull();
  });
});
