import axios from 'axios'
import { Timer } from './storage'

export async function fetchTimers(apiUrl: string, jwt: string): Promise<Timer[]> {
  const res = await axios.get<{ timers: Timer[] }>(`${apiUrl}/timers`, {
    headers: { Authorization: `Bearer ${jwt}` },
    timeout: 10_000,
  })
  return res.data.timers ?? []
}
