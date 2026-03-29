import { Platform } from 'react-native';

let WidgetDataModule: {
  setWidgetData(json: string): Promise<void>;
  getWidgetDiagnostics(): Promise<string>;
} | null = null;

if (Platform.OS === 'ios') {
  try {
    const { requireNativeModule } = require('expo-modules-core');
    WidgetDataModule = requireNativeModule('WidgetData');
  } catch {
    // Widget module not available (e.g. Expo Go)
  }
}

export function isModuleAvailable(): boolean {
  return WidgetDataModule !== null;
}

export async function setWidgetData(jsonString: string): Promise<void> {
  if (WidgetDataModule) {
    return WidgetDataModule.setWidgetData(jsonString);
  }
}

export async function getWidgetDiagnostics(): Promise<Record<string, unknown> | null> {
  if (!WidgetDataModule) return null;
  const json = await WidgetDataModule.getWidgetDiagnostics();
  return JSON.parse(json);
}
