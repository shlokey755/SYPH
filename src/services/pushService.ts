/**
 * pushService.ts
 * Device side of push notifications (FR-10): permission, Expo push token, Android channel, foreground behaviour.
 *
 * Remote push needs a development or production build. It cannot work in Expo Go (Android removed it in SDK 53),
 * on web, or on simulators, so every function degrades to "unsupported" instead of throwing. expo-notifications
 * is loaded lazily and only where it can work, which also keeps Expo Go free of its warning banner.
 * In those environments users still get the in-app toasts (see useConversations).
 */

import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { addPushToken, removePushToken } from './userService';

type NotificationsModule = typeof import('expo-notifications');

/** Android notification channel the relay targets (channelId in the push payload). */
export const MESSAGES_CHANNEL_ID = 'messages';

export type PushRegistration =
  | { status: 'registered'; token: string }
  | { status: 'unsupported' }
  | { status: 'denied' }
  | { status: 'error'; message: string };

let notificationsModule: NotificationsModule | null | undefined;
let foregroundConfigured = false;
let registeredToken: string | null = null;

export function isPushSupported(): boolean {
  return Platform.OS !== 'web' && Device.isDevice && !isRunningInExpoGo();
}

/** expo-notifications, or null where remote push cannot work. */
export function getNotifications(): NotificationsModule | null {
  if (notificationsModule !== undefined) return notificationsModule;
  if (!isPushSupported()) {
    notificationsModule = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    notificationsModule = require('expo-notifications') as NotificationsModule;
  } catch (error) {
    console.warn('expo-notifications is unavailable:', error);
    notificationsModule = null;
  }
  return notificationsModule;
}

/**
 * While the app is open the in-app toast already announces new messages, so the system banner is suppressed
 * to avoid showing every message twice.
 */
export function configureForegroundBehavior(): void {
  const Notifications = getNotifications();
  if (!Notifications || foregroundConfigured) return;
  foregroundConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensurePermission(Notifications: NotificationsModule): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/**
 * Asks for permission (first time only), fetches this device's Expo push token and saves it for the user.
 * Safe to call on every launch: the write is skipped when the token is already stored.
 */
export async function registerForPush(
  uid: string,
  knownTokens: readonly string[] = []
): Promise<PushRegistration> {
  const Notifications = getNotifications();
  if (!Notifications) return { status: 'unsupported' };

  try {
    // Android 13+ only shows the permission prompt once a channel exists.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(MESSAGES_CHANNEL_ID, {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 100, 200],
      });
    }

    if (!(await ensurePermission(Notifications))) return { status: 'denied' };

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return { status: 'error', message: 'Missing extra.eas.projectId in app.json' };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    registeredToken = token;
    if (!knownTokens.includes(token)) await addPushToken(uid, token, Platform.OS);
    return { status: 'registered', token };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Detaches this device from the user's account. Called just before sign-out so a shared phone stops receiving
 * the previous user's notifications. Never blocks logout for long: gives up after `timeoutMs`.
 */
export async function unregisterPush(uid: string, timeoutMs = 3000): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;

  const work = (async () => {
    let token = registeredToken;
    if (!token) {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) return;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    }
    await removePushToken(uid, token);
    registeredToken = null;
  })().catch((error) => console.warn('Could not unregister push token:', error));

  await Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
}

/** Shows `count` on the app icon where the launcher supports it. */
export async function setAppBadge(count: number): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // Badges are cosmetic; some Android launchers do not support them.
  }
}

/** The chat to open for a tapped notification, or null when the payload has none. */
export function conversationIdFromResponse(
  response: import('expo-notifications').NotificationResponse | null | undefined
): string | null {
  const data = response?.notification.request.content.data;
  const id = data?.conversationId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
