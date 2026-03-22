import axios from 'axios'
import { fetchTimers } from '../api'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('fetchTimers', () => {
  beforeEach(() => jest.clearAllMocks())

  it('API からタイマー一覧を取得する', async () => {
    const timers = [
      { type: 'expedition', slot: 1, completesAt: '2026-01-01T12:00:00Z', message: '遠征1' },
      { type: 'repair', slot: 2, completesAt: '2026-01-01T13:00:00Z', message: '入渠2' },
    ]
    mockedAxios.get.mockResolvedValue({ data: { timers } })

    const result = await fetchTimers('https://api.example.com', 'test-jwt')

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.example.com/timers',
      { headers: { Authorization: 'Bearer test-jwt' }, timeout: 10_000 },
    )
    expect(result).toEqual(timers)
  })

  it('timers が undefined の場合は空配列を返す', async () => {
    mockedAxios.get.mockResolvedValue({ data: {} })
    const result = await fetchTimers('https://api.example.com', 'jwt')
    expect(result).toEqual([])
  })

  it('API エラー時は例外を投げる', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network Error'))
    await expect(fetchTimers('https://api.example.com', 'jwt')).rejects.toThrow('Network Error')
  })
})
