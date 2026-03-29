jest.mock('../../../modules/widget-data', () => ({
  setWidgetData: jest.fn(() => Promise.resolve()),
}));

import { setWidgetData } from '../../../modules/widget-data';
import { syncWidgetData } from '../widgetSync';

const mockedSetWidgetData = setWidgetData as jest.MockedFunction<typeof setWidgetData>;

beforeEach(() => jest.clearAllMocks());

describe('syncWidgetData', () => {
  it('タイマーデータを JSON 文字列でネイティブモジュールに渡す', async () => {
    const timers = [{ type: 'expedition' as const, slot: 2, completesAt: '2026-01-01T12:00:00Z', message: '遠征完了' }];
    const lastSync = 1700000000000;

    const result = await syncWidgetData(timers, lastSync);

    expect(result).toBe(true);
    expect(mockedSetWidgetData).toHaveBeenCalledTimes(1);
    const arg = JSON.parse(mockedSetWidgetData.mock.calls[0][0]);
    expect(arg.timers).toEqual(timers);
    expect(arg.lastSync).toBe(lastSync);
  });

  it('ネイティブモジュールがエラーでも例外を投げない', async () => {
    mockedSetWidgetData.mockRejectedValue(new Error('Module not available'));

    const result = await syncWidgetData([], null);
    expect(result).toBe(false);
  });
});
