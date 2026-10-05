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
  isMuted: (conversationId: string) => boolean;
  toggleMute: (conversationId: string) => Promise<void>;
  setNotifications: (enabled: boolean) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const UserSettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!uid) {
      setSettings(DEFAULT_SETTINGS);
      return;
    }
    return onSnapshot(
      doc(db, 'users', uid, 'private', 'settings'),
      (snap) => setSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as Partial<UserSettings> | undefined) }),
      (error) => console.warn('Settings listener error:', error.message)
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
    () => ({ settings, isMuted, toggleMute, setNotifications }),
    [settings, isMuted, toggleMute, setNotifications]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useUserSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useUserSettings must be used within a UserSettingsProvider');
  return ctx;
};
