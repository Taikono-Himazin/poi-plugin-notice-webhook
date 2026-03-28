import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { loadConfigFromOutputs } from './storage';

const reported = new Set<string>();

export function reportError(err: unknown, ctx?: Record<string, string>): void {
  const config = loadConfigFromOutputs();
  if (!config) return;

  const error = err instanceof Error ? err : new Error(String(err));
  const key = error.message.slice(0, 200);
  if (reported.has(key)) return;
  reported.add(key);

  const appVersion = Constants.expoConfig?.version ?? 'unknown';

  fetch(`${config.apiUrl}/errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'mobile-app',
      level: 'error',
      message: key,
      stack: (error.stack ?? '').slice(0, 5000),
      context: {
        appVersion,
        platform: Platform.OS,
        osVersion: String(Platform.Version),
        ...ctx,
      },
    }),
  }).catch(() => {});
}
