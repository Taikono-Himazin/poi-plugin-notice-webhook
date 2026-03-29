import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Storage } from './storage';
import { registerPushToken as registerPushTokenApi } from './api';

/**
 * Expo Push Token を取得してサーバに登録し、ローカルにキャッシュする。
 * 通知権限がない場合は何もしない。
 */
export async function registerPushToken(apiUrl: string, jwt: string): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('silent', {
      name: 'Silent sync',
      importance: Notifications.AndroidImportance.MIN,
      sound: null,
    });
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: pushToken } = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  await registerPushTokenApi(apiUrl, jwt, pushToken);
  await Storage.setPushToken(pushToken);
}
