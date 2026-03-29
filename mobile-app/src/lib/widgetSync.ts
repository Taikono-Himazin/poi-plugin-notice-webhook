import { setWidgetData } from '../../modules/widget-data';
import { Timer } from './storage';

export async function syncWidgetData(timers: Timer[], lastSync: number | null): Promise<boolean> {
  try {
    const data = JSON.stringify({ timers, lastSync });
    await setWidgetData(data);
    return true;
  } catch (e) {
    console.warn('[widgetSync] setWidgetData failed:', e);
    return false;
  }
}
