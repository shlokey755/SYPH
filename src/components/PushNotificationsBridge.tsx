/**
 * PushNotificationsBridge.tsx
 * Renders nothing. While a user is signed in it:
 *   - registers this device for push (once settings say notifications are on),
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

  useEffect(() => {
    configureForegroundBehavior();
  }, []);

  useEffect(() => {
    if (!uid || !isLoaded || !enabled) return;
    let cancelled = false;
    registerForPush(uid, knownTokensRef.current).then((result) => {
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
