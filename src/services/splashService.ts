/**
 * splashService.ts
 * Keeps the native splash screen up until the app is ready (see utils/splash.ts for the rules) and hides it once.
 *
 * keepSplashVisible() runs when the root layout is first loaded, in global scope as the Expo docs recommend, because
 * calling it from a component can run after the splash has already gone. It also starts the hard time limit, so the
 * splash is removed even if nothing ever reports "ready". Every call into the splash module is wrapped: a splash
 * problem must never stop the app from opening.
 */

import * as SplashScreen from 'expo-splash-screen';
import { SPLASH_MAX_WAIT_MS } from '../utils/splash';

/** Epoch ms when this module loaded, which is when the app's JavaScript started. */
export const splashStartedAt = Date.now();

let hidden = false;

export function hideSplash(): void {
  if (hidden) return;
  hidden = true;
  try {
    SplashScreen.hide();
  } catch (error) {
    console.warn('Could not hide the splash screen:', (error as { message?: string })?.message ?? error);
  }
}

export function keepSplashVisible(): void {
  try {
    SplashScreen.preventAutoHideAsync().catch(() => {});
  } catch {
    // Not available (Expo Go on some setups): the default behaviour is fine.
  }
  setTimeout(hideSplash, SPLASH_MAX_WAIT_MS);
}
