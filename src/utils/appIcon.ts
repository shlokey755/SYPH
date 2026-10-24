/**
 * appIcon.ts
 * Which launcher icon belongs to which theme. Pure logic, unit tested in Node.
 *
 * The icons themselves are declared in app.json under the "@variant-systems/expo-dynamic-app-icon" plugin: one entry
 * per theme, and the entry's name is the theme id. tests/unit/appIcon.test.ts checks that app.json and this table agree,
 * because a theme with no matching icon silently falls back to the default icon on Android.
 */

import type { ThemeOption } from '../hooks/themeContext';

/** Theme id -> name of its icon in app.json. Typed as a Record, so adding a theme without an icon fails typecheck. */
export const ICON_FOR_THEME: Record<ThemeOption, string> = {
  'cyan-black': 'cyan-black',
  'white-black': 'white-black',
  'beige-purple': 'beige-purple',
  ocean: 'ocean',
  forest: 'forest',
  sunset: 'sunset',
};

export const iconForTheme = (theme: ThemeOption): string => ICON_FOR_THEME[theme];

/** Skip the native call when the icon is already the one we last set (it would only cause a needless change). */
export const shouldChangeIcon = (last: string | null | undefined, next: string): boolean => last !== next;
