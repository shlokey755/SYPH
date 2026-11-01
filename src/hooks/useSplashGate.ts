/**
 * useSplashGate.ts
 * Hides the native splash once the app is ready and the logo has been visible long enough
 * (rules in utils/splash.ts, the hard time limit lives in services/splashService.ts).
 */

import { useEffect, useSyncExternalStore } from 'react';
import { hideSplash, isSplashHidden, splashStartedAt, subscribeSplashHidden } from '../services/splashService';
import { splashHideDelay } from '../utils/splash';

export function useSplashGate(ready: boolean): void {
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

/** True once the splash is gone. Screen transitions are switched off until then (see _layout.tsx). */
export function useSplashHidden(): boolean {
  return useSyncExternalStore(subscribeSplashHidden, isSplashHidden, isSplashHidden);
}
