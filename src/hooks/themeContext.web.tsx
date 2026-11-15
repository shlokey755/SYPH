/**
 * themeContext.web.tsx
 * The theme context in a browser: one palette, the parchment of the pirate map, for every screen. The phone's themes (black and
 * cyan, monochrome, …) belong to the phone. A browser still runs the pieces it shares with the phone (the add-people sheet, the
 * incoming-call box, the location and video viewers), and they take their colours from here, so they come out as parchment and
 * ink instead of cyan on black.
 * Nothing is chosen, stored or synced: `useTheme()` returns the same object every time, which is safe in dependency lists, and the
 * theme saved on the person's profile is left for the phone.
 * It exports what themeContext.tsx exports (tests/unit/themeContext.test.ts checks it). A phone never loads this file.
 */

import React from 'react';
import { ThemeColors as MapColors, vintage } from '../theme/colors';

export type ThemeOption = 'cyber' | 'monochrome' | 'candy' | 'ocean' | 'forest' | 'sunset';

export type ThemeColors = MapColors;

export const DEFAULT_THEME: ThemeOption = 'cyber';

/** Every name leads to the same parchment. */
export const themeSchemes: Record<ThemeOption, ThemeColors> = {
  cyber: vintage,
  monochrome: vintage,
  candy: vintage,
  ocean: vintage,
  forest: vintage,
  sunset: vintage,
};

export const themeList = (Object.keys(themeSchemes) as ThemeOption[]).map((id) => ({ id, label: id, colors: vintage }));

export const isThemeOption = (value: unknown): value is ThemeOption =>
  typeof value === 'string' && value in themeSchemes;

interface ThemeContextType {
  selectedTheme: ThemeOption;
  isReady: boolean;
  themeColors: ThemeColors;
  setTheme: (theme: ThemeOption) => void;
}

const theme: ThemeContextType = {
  selectedTheme: DEFAULT_THEME,
  isReady: true,
  themeColors: vintage,
  setTheme: () => {},
};

/** Nothing to provide: kept so the root layout reads the same as the phone's. */
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export const useTheme = (): ThemeContextType => theme;
