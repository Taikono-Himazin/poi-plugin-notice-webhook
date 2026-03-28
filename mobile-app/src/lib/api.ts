import axios from 'axios'
import { Timer } from './storage'

export async function fetchTimers(apiUrl: string, jwt: string): Promise<Timer[]> {
  const res = await axios.get<{ timers: Timer[] }>(`${apiUrl}/timers`, {
    headers: { Authorization: `Bearer ${jwt}` },
    timeout: 10_000,
  })
  return res.data.timers ?? []
}

export async function registerPushToken(apiUrl: string, jwt: string, pushToken: string): Promise<void> {
  await axios.put(`${apiUrl}/push-tokens`, { pushToken }, {
    headers: { Authorization: `Bearer ${jwt}` },
    timeout: 10_000,
  })
}

export async function deletePushToken(apiUrl: string, jwt: string, pushToken: string): Promise<void> {
  await axios.delete(`${apiUrl}/push-tokens`, {
    headers: { Authorization: `Bearer ${jwt}` },
    data: { pushToken },
    timeout: 10_000,
  })
}
