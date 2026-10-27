/**
 * appIconService.ts
 * Changes the launcher icon to match the theme.
 *
 * Needs a native build (the module is missing in Expo Go and on web), so the module is loaded lazily and every failure
 * is swallowed: an icon that does not change must never break the app or the theme switch.
 *
 * Android swaps the icon with an activity-alias and applies it when the app goes to the background, so the change
 * shows up once the person leaves the app. iOS shows its own "icon changed" notice, which is why the last icon is
 * remembered and an unchanged icon is never set again.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { ThemeOption } from '../hooks/themeContext';
import { iconForTheme, shouldChangeIcon } from '../utils/appIcon';

const STORAGE_KEY = 'syph.appIcon';

type IconModule = { setAppIcon: (name: string) => unknown };

let iconModule: IconModule | null | undefined;

function loadModule(): IconModule | null {
  if (iconModule !== undefined) return iconModule;
  try {
    const loaded = require('@variant-systems/expo-dynamic-app-icon');
    const candidate = (loaded?.default ?? loaded) as Partial<IconModule> | undefined;
    iconModule = typeof candidate?.setAppIcon === 'function' ? (candidate as IconModule) : null;
  } catch {
    iconModule = null; // Expo Go, web or a build made before the plugin was added
  }
  return iconModule;
}

/** Sets the icon that belongs to `theme`. Never throws. */
export async function applyThemeIcon(theme: ThemeOption): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const icon = iconForTheme(theme);
    const last = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    if (!shouldChangeIcon(last, icon)) return;
    const module = loadModule();
    if (!module) return;
    module.setAppIcon(icon);
    await AsyncStorage.setItem(STORAGE_KEY, icon).catch(() => {});
  } catch (error) {
    console.warn('Could not change the app icon:', (error as { message?: string })?.message ?? error);
  }
}
