/**
 * useSplashGate.ts
 * Hides the native splash once the app is ready and the logo has been visible long enough
 * (rules in utils/splash.ts, the hard time limit lives in services/splashService.ts).
 *
 * "Ready" means nothing on screen can change after the splash goes, so the hand-off to the first screen cannot be
 * seen: sign-in state known (`authReady`, from the caller), the theme saved on the phone read, the icon font loaded
 * (icons draw blank until it is) and the entry route has opened the first real screen underneath.
 */

import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { useSegments } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { hideSplash, isSplashHidden, splashStartedAt, subscribeSplashHidden } from '../services/splashService';
import { useStartupRouted } from '../services/startupRoute';
import { firstScreenChosen, isIndexRoute, splashHideDelay } from '../utils/splash';
import { useTheme } from './themeContext';

export function useSplashGate(authReady: boolean): void {
  const { isReady: themeReady } = useTheme();
  const segments = useSegments();
  const routed = useStartupRouted();
  // A failed font load must not keep the splash up: the icons would be missing, as they would have been anyway.
  const [fontsLoaded, fontError] = useFonts(Ionicons.font);

  const firstScreenReady = firstScreenChosen({ onIndexRoute: isIndexRoute(segments), routed });
  const ready = authReady && themeReady && (fontsLoaded || fontError != null) && firstScreenReady;

  useEffect(() => {
    const delay = splashHideDelay({ startedAt: splashStartedAt, now: Date.now(), ready });
    if (delay === null) return;
    if (delay === 0) {
      hideSplash();
      return;
    }
    const timer = setTimeout(hideSplash, delay);
    return () => clearTimeout(timer);
  }, [ready]);
}

/** True once the splash is gone. Screen transitions are switched off until then (see components/StartupStack.tsx). */
export function useSplashHidden(): boolean {
  return useSyncExternalStore(subscribeSplashHidden, isSplashHidden, isSplashHidden);
}
