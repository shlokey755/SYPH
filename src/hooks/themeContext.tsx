/**
 * themeContext.tsx
 * App themes (FR-13, FR-14, FR-15).
 *
 * - Default: Cyan & Black. Also Black & White plus several colour themes.
 * - The choice is cached on the device (instant on launch) and saved to the user's profile
 *   (users/{uid}.theme), so it follows them to a new phone.
 * - Themes drive backgrounds, chat bubbles, navigation bar, buttons/icons, toasts and accents.
 * - The colour wheel (Me tab) lays one hue over the chosen theme: the accent, and the text on it, take that hue
 *   (utils/accentColor.ts) and the launcher icon follows it. Choosing a theme goes back to the theme's own accent.
 *   Kept like the theme: on the device (instant on launch) and on the profile (users/{uid}.accentHue).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { applyThemeIcon } from '../services/appIconService';
import { patchCachedProfile } from '../services/profileCache';
import { saveAccentHue, saveTheme } from '../services/userService';
import { accentColors, hueOf } from '../utils/accentColor';
import { useAuth } from './useAuth';

export type ThemeOption =
  | 'cyber'
  | 'monochrome'
  | 'candy'
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

export const DEFAULT_THEME: ThemeOption = 'cyber';

export const themeSchemes: Record<ThemeOption, ThemeColors> = {
  'cyber': {
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
  'monochrome': {
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
  'candy': {
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
  'cyber': 'Cyber',
  'monochrome': 'Monochrome',
  'candy': 'Candy',
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
const HUE_STORAGE_KEY = 'syph.accentHue';

/** Remembers the hue on the device; no hue removes the entry. */
const storeHue = (hue: number | null) =>
  (hue === null ? AsyncStorage.removeItem(HUE_STORAGE_KEY) : AsyncStorage.setItem(HUE_STORAGE_KEY, String(hue))).catch(() => {});

interface ThemeContextType {
  selectedTheme: ThemeOption;
  /** True once the theme saved on this device has been read. The splash waits for it so the colours never switch after it. */
  isReady: boolean;
  themeColors: ThemeColors;
  setTheme: (theme: ThemeOption) => void;
  /** The hue (0 to 359) picked on the colour wheel, or null while the theme's own accent is used. */
  accentHue: number | null;
  setAccentHue: (hue: number | null) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const profileTheme = currentUser?.theme;
  const profileHue = currentUser?.accentHue;

  const [selectedTheme, setSelectedTheme] = useState<ThemeOption>(DEFAULT_THEME);
  const [accentHue, setAccentHueState] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const profileAppliedFor = useRef<string | null>(null);

  // Device cache: gives the right theme immediately on launch, before the profile has loaded.
  useEffect(() => {
    Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(HUE_STORAGE_KEY)])
      .then(([stored, storedHue]) => {
        if (profileAppliedFor.current !== null) return;
        if (isThemeOption(stored)) setSelectedTheme(stored);
        setAccentHueState(hueOf(storedHue));
      })
      .catch(() => {})
      .finally(() => setIsReady(true));
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
      // An account that never used the colour wheel has no hue saved: it uses its theme's own accent.
      const hue = profileHue ?? null;
      setSelectedTheme(profileTheme);
      setAccentHueState(hue);
      AsyncStorage.setItem(STORAGE_KEY, profileTheme).catch(() => {});
      storeHue(hue);
      applyThemeIcon(profileTheme, hue); // a theme or colour chosen on another phone also changes this phone's icon
    }
  }, [uid, profileTheme, profileHue]);

  // Picking a theme means that theme as designed, so it also drops the colour-wheel hue.
  const setTheme = useCallback(
    (theme: ThemeOption) => {
      setSelectedTheme(theme);
      setAccentHueState(null);
      AsyncStorage.setItem(STORAGE_KEY, theme).catch(() => {});
      storeHue(null);
      applyThemeIcon(theme);
      if (uid) {
        // The copy of the profile kept on the device is what the next start reads first: keep it in step.
        patchCachedProfile(uid, { theme, accentHue: null }).catch(() => {});
        saveTheme(uid, theme).catch((e) => console.warn('Could not save theme to profile:', e));
      }
    },
    [uid]
  );

  const setAccentHue = useCallback(
    (hue: number | null) => {
      const next = hue === null ? null : hueOf(hue);
      setAccentHueState(next);
      storeHue(next);
      applyThemeIcon(selectedTheme, next);
      if (uid) {
        patchCachedProfile(uid, { accentHue: next }).catch(() => {});
        saveAccentHue(uid, next).catch((e) => console.warn('Could not save the accent colour to profile:', e));
      }
    },
    [uid, selectedTheme]
  );

  const themeColors = useMemo(() => {
    const base = themeSchemes[selectedTheme];
    return accentHue === null ? base : { ...base, ...accentColors(accentHue, base.isDark) };
  }, [selectedTheme, accentHue]);

  const value = useMemo(
    () => ({ selectedTheme, isReady, themeColors, setTheme, accentHue, setAccentHue }),
    [selectedTheme, isReady, themeColors, setTheme, accentHue, setAccentHue]
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
