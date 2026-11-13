/**
 * PushNotificationsBridge.tsx
 * Renders nothing. While a user is signed in it:
 *   - registers this device for push (once settings say notifications are on),
 *   - mirrors the push-relevant settings to userPush/{uid} so other people's phones can notify this one,
 *   - copies the message tone, ringtone and vibration choice to the account, so a notification arrives with that sound even
 *     while SYPH is closed (Android plays the sound of the channel the sender picked),
 *   - opens the right chat when a notification is tapped (including a cold start from a notification),
 *   - mirrors the unread total on the app icon.
 * Mounted inside the tabs layout, which only exists for signed-in users once navigation is ready.
 */

import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import { useUserSettings } from '../hooks/useUserSettings';
import {
  configureForegroundBehavior,
  conversationIdFromResponse,
  getNotifications,
  registerForPush,
  setAppBadge,
} from '../services/pushService';
import { onAlertPrefsChanged, whenAlertPrefsReady } from '../services/alertPrefsStore';
import { saveAlertChoices, syncPushMirror } from '../services/userService';
import { AccountAlerts, mirrorFromSettings, mirrorKey } from '../utils/push';

const accountAlertsOf = (prefs: AccountAlerts): AccountAlerts => ({
  messageTone: prefs.messageTone,
  ringtone: prefs.ringtone,
  vibrate: prefs.vibrate,
});

// Module scope so a remount in the same session never re-opens a notification that was already handled.
let lastHandledNotificationId: string | null = null;

export function PushNotificationsBridge() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { settings, isLoaded } = useUserSettings();
  const { unreadTotal } = useConversations();

  const uid = currentUser?.uid;
  const enabled = settings.notificationsEnabled;

  // Read through a ref so a token being saved does not re-trigger registration.
  const knownTokensRef = useRef(settings.expoPushTokens);
  knownTokensRef.current = settings.expoPushTokens;
  const knownClosedRef = useRef(settings.closedAlertTokens ?? []);
  knownClosedRef.current = settings.closedAlertTokens ?? [];

  useEffect(() => {
    configureForegroundBehavior();
  }, []);

  // Keep the shared copy of the push settings current. Covers devices added or removed, the master switch and mutes,
  // and accounts that predate the mirror. The key skips writes when nothing changed.
  const mirror = mirrorFromSettings(settings);
  const key = mirrorKey(mirror);
  const syncedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!uid || !isLoaded || syncedKeyRef.current === `${uid}:${key}`) return;
    syncedKeyRef.current = `${uid}:${key}`;
    syncPushMirror(uid, mirror).catch((error) => {
      syncedKeyRef.current = null; // try again on the next change or launch
      console.warn('Push settings sync failed:', error?.message ?? error);
    });
    // `mirror` is derived from `key`, so the key alone decides when to write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, isLoaded, key]);

  // The account's copy of the alert choices (senders read it to choose the channel). An account that has none yet gets this
  // phone's choices once, after the saved copy on the phone was read (so defaults never overwrite real choices); after that
  // every change made here is saved. Another phone changing them simply wins until this one changes them again.
  const hasAccountAlerts = settings.alerts !== undefined;
  useEffect(() => {
    if (!uid || !isLoaded) return;
    let cancelled = false;
    const save = (prefs: AccountAlerts) =>
      saveAlertChoices(uid, accountAlertsOf(prefs)).catch((error) =>
        console.warn('Saving alert choices failed:', error?.message ?? error)
      );
    if (!hasAccountAlerts) {
      void whenAlertPrefsReady().then((prefs) => {
        if (!cancelled) void save(prefs);
      });
    }
    const stop = onAlertPrefsChanged(save);
    return () => {
      cancelled = true;
      stop();
    };
  }, [uid, isLoaded, hasAccountAlerts]);

  useEffect(() => {
    if (!uid || !isLoaded || !enabled) return;
    let cancelled = false;
    registerForPush(uid, knownTokensRef.current, knownClosedRef.current).then((result) => {
      if (!cancelled && result.status === 'error') {
        console.warn('Push registration failed:', result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [uid, isLoaded, enabled]);

  useEffect(() => {
    const Notifications = getNotifications();
    if (!Notifications || !uid) return;

    const open = (response: import('expo-notifications').NotificationResponse) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const notificationId = response.notification.request.identifier;
      const conversationId = conversationIdFromResponse(response);
      if (!conversationId || notificationId === lastHandledNotificationId) return;
      lastHandledNotificationId = notificationId;
      router.push({ pathname: '/chat/[id]', params: { id: conversationId } });
    };

    // Cold start: the notification that launched the app.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) open(response);
      })
      .catch(() => {});

    // Taps while the app is running or in the background.
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [uid, router]);

  useEffect(() => {
    void setAppBadge(unreadTotal);
  }, [unreadTotal]);

  return null;
}
