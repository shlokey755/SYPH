/**
 * useNotifications.ts (FIXED)
 * Real-time notification system for incoming messages
 * 
 * FIXED: Proper AppStateStatus typing for React Native
 * 
 * Features:
 * - Toast notifications
 * - Badge counts
 * - Sound alerts
 * - Focus detection
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState, AppStateStatus, Vibration } from 'react-native';


interface NotificationState {
  unreadCount: number;
  lastNotificationTime: number;
}

export const useNotifications = (currentUserId: string | undefined) => {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [notifications, setNotifications] = useState<NotificationState>({
    unreadCount: 0,
    lastNotificationTime: 0,
  });
  

  // Handle app state change
  const handleAppStateChange = useCallback((state: AppStateStatus) => {
    setAppState(state);
  }, []);

  // Track app state (foreground/background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [handleAppStateChange]);

  

  // Show notification when message arrives
  const showNotification = useCallback(
    async (
      senderUsername: string,
      messageText: string,
      isBackground: boolean = false
    ) => {
      const now = Date.now();

      // Throttle notifications (max 1 per 500ms)
      if (now - notifications.lastNotificationTime < 500) {
        return;
      }

      // Only show notifications if app is in background or user is in different chat
      if (isBackground || appState !== 'active') {
        // Vibrate
        try {
          Vibration.vibrate(200);
        } catch (error) {
          console.error('Failed to vibrate:', error);
        }

        

        // Increment unread badge
        setNotifications((prev) => ({
          unreadCount: prev.unreadCount + 1,
          lastNotificationTime: now,
        }));
      }
    },
    [appState, notifications.lastNotificationTime]
  );

  // Clear badge when reading messages
  const clearNotifications = useCallback(() => {
    setNotifications({
      unreadCount: 0,
      lastNotificationTime: Date.now(),
    });
  }, []);

  // Increment unread count
  const incrementUnread = useCallback(() => {
    setNotifications((prev) => ({
      ...prev,
      unreadCount: prev.unreadCount + 1,
    }));
  }, []);

  return {
    notifications,
    showNotification,
    clearNotifications,
    incrementUnread,
    isAppInBackground: appState !== 'active',
  };
};