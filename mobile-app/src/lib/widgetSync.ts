import { setWidgetData } from '../../modules/widget-data'
import { Timer } from './storage'

export async function syncWidgetData(timers: Timer[], lastSync: number | null): Promise<void> {
  try {
    const data = JSON.stringify({ timers, lastSync })
    await setWidgetData(data)
  } catch {
    // Widget module may not be available (Android, Expo Go, etc.)
  }
}
