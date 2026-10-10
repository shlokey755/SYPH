/**
 * themeContext.tsx
 * App themes (FR-13, FR-14, FR-15).
 *
 * - Default: Cyan & Black. Also Black & White plus several colour themes.
 * - The choice is cached on the device (instant on launch) and saved to the user's profile
 *   (users/{uid}.theme), so it follows them to a new phone.
 * - Themes drive backgrounds, chat bubbles, navigation bar, buttons/icons, toasts and accents.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { saveTheme } from '../services/userService';
import { useAuth } from './useAuth';

export type ThemeOption =
  | 'cyan-black'
  | 'white-black'
  | 'beige-purple'
  | 'ocean'
  | 'forest'
  | 'sunset';

export interface ThemeColors {
  background: string;
  cardBackground: string;
  text: string;
  subText: string;
  /** Main brand colour: buttons, own chat bubbles, active tab, links. */
  accent: string;
  border: string;
  inputBg: string;
  /** Text/icon colour used on top of `accent`. */
  buttonText: string;
  /** Errors and destructive actions. */
  danger: string;
  /** Drives the status bar icon colour. */
  isDark: boolean;
}

export const DEFAULT_THEME: ThemeOption = 'cyan-black';

export const themeSchemes: Record<ThemeOption, ThemeColors> = {
  'cyan-black': {
    background: '#000000',
    cardBackground: '#0D1117',
    text: '#FFFFFF',
    subText: '#8B98A5',
    accent: '#00E5FF',
    border: '#1F2933',
    inputBg: '#0D1117',
    buttonText: '#000000',
    danger: '#FF6B81',
    isDark: true,
  },
  'white-black': {
    background: '#FFFFFF',
    cardBackground: '#F2F2F2',
    text: '#000000',
    subText: '#666666',
    accent: '#000000',
    border: '#E0E0E0',
    inputBg: '#F5F5F5',
    buttonText: '#FFFFFF',
    danger: '#C62828',
    isDark: false,
  },
  'beige-purple': {
    background: '#F5F5DC',
    cardBackground: '#E8E8C8',
    text: '#333333',
    subText: '#555555',
    accent: '#800080',
    border: '#D3D3A1',
    inputBg: '#FFFFFF',
    buttonText: '#FFFFFF',
    danger: '#B00020',
    isDark: false,
  },
  ocean: {
    background: '#0A1929',
    cardBackground: '#102A43',
    text: '#F0F4F8',
    subText: '#9FB3C8',
    accent: '#4DA3FF',
    border: '#1E3A56',
    inputBg: '#102A43',
    buttonText: '#06121F',
    danger: '#FF6B81',
    isDark: true,
  },
  forest: {
    background: '#0B1410',
    cardBackground: '#14221B',
    text: '#ECF5EF',
    subText: '#93AB9B',
    accent: '#3DDC84',
    border: '#223A2D',
    inputBg: '#14221B',
    buttonText: '#06130B',
    danger: '#FF6B81',
    isDark: true,
  },
  sunset: {
    background: '#1A1016',
    cardBackground: '#27171F',
    text: '#FFF1EB',
    subText: '#C7A59B',
    accent: '#FF7A59',
    border: '#3D2530',
    inputBg: '#27171F',
    buttonText: '#1A0A05',
    danger: '#FF6B81',
    isDark: true,
  },
};

const THEME_LABELS: Record<ThemeOption, string> = {
  'cyan-black': 'Cyan & Black',
  'white-black': 'Black & White',
  'beige-purple': 'Beige & Purple',
  ocean: 'Ocean',
  forest: 'Forest',
  sunset: 'Sunset',
};

/** For pickers: id, label and colours of every theme. */
export const themeList = (Object.keys(themeSchemes) as ThemeOption[]).map((id) => ({
  id,
  label: THEME_LABELS[id],
  colors: themeSchemes[id],
}));

export const isThemeOption = (value: unknown): value is ThemeOption =>
  typeof value === 'string' && value in themeSchemes;

const STORAGE_KEY = 'syph.theme';

interface ThemeContextType {
  selectedTheme: ThemeOption;
  themeColors: ThemeColors;
  setTheme: (theme: ThemeOption) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const profileTheme = currentUser?.theme;

  const [selectedTheme, setSelectedTheme] = useState<ThemeOption>(DEFAULT_THEME);
  const profileAppliedFor = useRef<string | null>(null);

  // Device cache: gives the right theme immediately on launch, before the profile has loaded.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (isThemeOption(stored) && profileAppliedFor.current === null) setSelectedTheme(stored);
      })
      .catch(() => {});
  }, []);

  // Profile wins after sign-in (applied once per sign-in, not on every profile update).
  useEffect(() => {
    if (!uid) {
      profileAppliedFor.current = null;
      return;
    }
    if (profileAppliedFor.current === uid) return;
    profileAppliedFor.current = uid;
    if (isThemeOption(profileTheme)) {
      setSelectedTheme(profileTheme);
      AsyncStorage.setItem(STORAGE_KEY, profileTheme).catch(() => {});
    }
  }, [uid, profileTheme]);

  const setTheme = useCallback(
    (theme: ThemeOption) => {
      setSelectedTheme(theme);
      AsyncStorage.setItem(STORAGE_KEY, theme).catch(() => {});
      if (uid) saveTheme(uid, theme).catch((e) => console.warn('Could not save theme to profile:', e));
    },
    [uid]
  );

  const value = useMemo(
    () => ({ selectedTheme, themeColors: themeSchemes[selectedTheme], setTheme }),
    [selectedTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
