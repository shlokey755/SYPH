/**
 * appIconService.ts
 * Changes the launcher icon to match the theme.
 *
 * Needs a native build (the module is missing in Expo Go and on web), so the module is loaded lazily and every failure
 * is swallowed: an icon that does not change must never break the app or the theme switch.
 *
 * Android swaps the icon with an activity-alias and applies it when the app goes to the background, so the change
 * shows up once the person leaves the app. iOS shows its own "icon changed" notice, which is why the last icon is
 * remembered and an unchanged icon is never set again. On Android the icon really set is asked of the phone instead (see
 * `currentIcon`).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { ThemeOption } from '../hooks/themeContext';
import { iconNameForHue } from '../utils/accentColor';
import { iconForTheme, shouldChangeIcon } from '../utils/appIcon';

const STORAGE_KEY = 'syph.appIcon';

type IconModule = { setAppIcon: (name: string) => unknown; getAppIcon?: () => unknown };

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

/**
 * The icon that is really set. Android can say (the name of the enabled alias; '' for the plain default), and that is the truth
 * even when a phone was given an update before the APK that has the icon: asked for an icon its APK lacks, Android falls back to
 * the default but the call still looks like it worked, so the note kept here would be wrong for good. Elsewhere, and when the
 * call fails, it is what was last set from here.
 */
function currentIcon(module: IconModule, last: string | null): string | null {
  if (Platform.OS !== 'android' || typeof module.getAppIcon !== 'function') return last;
  try {
    const name = module.getAppIcon();
    return typeof name === 'string' ? name : last;
  } catch {
    return last;
  }
}

/**
 * Sets the launcher icon: the one closest to the colour-wheel hue when there is one, otherwise the one that belongs to
 * `theme`. Never throws.
 */
export async function applyThemeIcon(theme: ThemeOption, accentHue: number | null = null): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const icon = accentHue === null ? iconForTheme(theme) : iconNameForHue(accentHue);
    const module = loadModule();
    if (!module) return;
    const last = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    if (!shouldChangeIcon(currentIcon(module, last), icon)) return;
    module.setAppIcon(icon);
    await AsyncStorage.setItem(STORAGE_KEY, icon).catch(() => {});
  } catch (error) {
    console.warn('Could not change the app icon:', (error as { message?: string })?.message ?? error);
  }
}
