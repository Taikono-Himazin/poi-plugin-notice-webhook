import axios from 'axios';
import { fetchTimers, registerPushToken, deletePushToken } from '../api';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('fetchTimers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('API からタイマー一覧を取得する', async () => {
    const timers = [
      { type: 'expedition', slot: 1, completesAt: '2026-01-01T12:00:00Z', message: '遠征1' },
      { type: 'repair', slot: 2, completesAt: '2026-01-01T13:00:00Z', message: '入渠2' },
    ];
    mockedAxios.get.mockResolvedValue({ data: { timers } });

    const result = await fetchTimers('https://api.example.com', 'test-jwt');

    expect(mockedAxios.get).toHaveBeenCalledWith('https://api.example.com/timers', {
      headers: { Authorization: 'Bearer test-jwt' },
      timeout: 10_000,
    });
    expect(result).toEqual(timers);
  });

  it('timers が undefined の場合は空配列を返す', async () => {
    mockedAxios.get.mockResolvedValue({ data: {} });
    const result = await fetchTimers('https://api.example.com', 'jwt');
    expect(result).toEqual([]);
  });

  it('API エラー時は例外を投げる', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network Error'));
    await expect(fetchTimers('https://api.example.com', 'jwt')).rejects.toThrow('Network Error');
  });
});

describe('registerPushToken', () => {
  beforeEach(() => jest.clearAllMocks());

  it('PUT /push-tokens にトークンを送信する', async () => {
    mockedAxios.put.mockResolvedValue({ data: { ok: true } });

    await registerPushToken('https://api.example.com', 'jwt', 'ExponentPushToken[abc]');

    expect(mockedAxios.put).toHaveBeenCalledWith(
      'https://api.example.com/push-tokens',
      { pushToken: 'ExponentPushToken[abc]' },
      { headers: { Authorization: 'Bearer jwt' }, timeout: 10_000 },
    );
  });

  it('API エラー時は例外を投げる', async () => {
    mockedAxios.put.mockRejectedValue(new Error('Server Error'));
    await expect(registerPushToken('https://api.example.com', 'jwt', 'token')).rejects.toThrow('Server Error');
  });
});

describe('deletePushToken', () => {
  beforeEach(() => jest.clearAllMocks());

  it('DELETE /push-tokens にトークンを送信する', async () => {
    mockedAxios.delete.mockResolvedValue({ data: { ok: true } });

    await deletePushToken('https://api.example.com', 'jwt', 'ExponentPushToken[abc]');

    expect(mockedAxios.delete).toHaveBeenCalledWith('https://api.example.com/push-tokens', {
      headers: { Authorization: 'Bearer jwt' },
      data: { pushToken: 'ExponentPushToken[abc]' },
      timeout: 10_000,
    });
  });
});
