/**
 * useSplashGate.ts
 * Hides the native splash once the app is ready and the logo has been visible long enough
 * (rules in utils/splash.ts, the hard time limit lives in services/splashService.ts).
 */

import { useEffect } from 'react';
import { hideSplash, splashStartedAt } from '../services/splashService';
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
