/**
 * useUserSettings.tsx
 * Shared listener for users/{uid}/private/settings (muted chats, notification switch).
 */

import { doc, onSnapshot } from 'firebase/firestore';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { db } from '../firebaseConfig';
import { setChatMuted, setNotificationsEnabled } from '../services/userService';
import { UserSettings } from '../types';
import { useAuth } from './useAuth';

const DEFAULT_SETTINGS: UserSettings = {
  mutedChats: [],
  notificationsEnabled: true,
  expoPushTokens: [],
};

interface SettingsContextType {
  settings: UserSettings;
  /**
   * True once the real settings are known (server-confirmed, or found in the local cache).
   * Until then `settings` holds defaults, so anything that acts on them (e.g. push registration) should wait.
   */
  isLoaded: boolean;
  isMuted: (conversationId: string) => boolean;
  toggleMute: (conversationId: string) => Promise<void>;
  setNotifications: (enabled: boolean) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const UserSettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setSettings(DEFAULT_SETTINGS);
    setIsLoaded(false);
    if (!uid) return;

    return onSnapshot(
      doc(db, 'users', uid, 'private', 'settings'),
      // Metadata changes are included so we get a second event when the server confirms a cache-only answer.
      { includeMetadataChanges: true },
      (snap) => {
        const next: UserSettings = {
          ...DEFAULT_SETTINGS,
          ...(snap.data() as Partial<UserSettings> | undefined),
        };
        // Metadata-only events must not look like changes to consumers.
        setSettings((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
        // An empty cache hit while offline says nothing about the real settings.
        if (!snap.metadata.fromCache || snap.exists()) setIsLoaded(true);
      },
      (error) => {
        console.warn('Settings listener error:', error.message);
        setIsLoaded(true);
      }
    );
  }, [uid]);

  const isMuted = useCallback(
    (conversationId: string) => settings.mutedChats.includes(conversationId),
    [settings.mutedChats]
  );

  const toggleMute = useCallback(
    async (conversationId: string) => {
      if (!uid) return;
      await setChatMuted(uid, conversationId, !settings.mutedChats.includes(conversationId));
    },
    [uid, settings.mutedChats]
  );

  const setNotifications = useCallback(
    async (enabled: boolean) => {
      if (uid) await setNotificationsEnabled(uid, enabled);
    },
    [uid]
  );

  const value = useMemo(
    () => ({ settings, isLoaded, isMuted, toggleMute, setNotifications }),
    [settings, isLoaded, isMuted, toggleMute, setNotifications]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useUserSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useUserSettings must be used within a UserSettingsProvider');
  return ctx;
};
