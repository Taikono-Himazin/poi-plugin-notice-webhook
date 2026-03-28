import { Platform } from 'react-native'

let WidgetDataModule: { setWidgetData(json: string): Promise<void> } | null = null

if (Platform.OS === 'ios') {
  try {
    const { requireNativeModule } = require('expo-modules-core')
    WidgetDataModule = requireNativeModule('WidgetData')
  } catch {
    // Widget module not available (e.g. Expo Go)
  }
}

export async function setWidgetData(jsonString: string): Promise<void> {
  if (WidgetDataModule) {
    return WidgetDataModule.setWidgetData(jsonString)
  }
}
