/**
 * platform.ts
 * The few places where the phone and the browser need different styles. Everything else in components/parchment is the same code
 * on both, so a screen that uses these pieces looks the same in the app and on the web.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, ViewStyle } from 'react-native';
import { shadowSpec } from '../../theme/parchment';
import { COLUMN_WIDTH, boxShadowCss } from '../../theme/web';

export const IS_WEB = Platform.OS === 'web';

/**
 * For the outer box of a bottom sheet or a centred panel inside a `Modal`. A Modal on the web is drawn over the whole browser window,
 * not over the map column, so without this a sheet would stretch across a desktop monitor. On a phone it changes nothing.
 */
export const SHEET_FRAME: ViewStyle = { width: '100%', maxWidth: COLUMN_WIDTH, alignSelf: 'center' };

/** `useNativeDriver` for Animated: the web has no native animation engine and warns if it is asked for one. */
export const NATIVE_DRIVER = !IS_WEB;

/** A hand cursor over something that can be pressed. Only the web has a pointer. */
export const POINTER: ViewStyle = IS_WEB ? { cursor: 'pointer' } : {};

/** The shadow under a piece of paper, in the form each platform draws best (Android's elevation, iOS's shadow, CSS box-shadow). */
export function paperShadow(color: string, lift: number): ViewStyle {
  const s = shadowSpec(lift);
  if (s.opacity === 0) return {};
  if (IS_WEB) return { boxShadow: boxShadowCss(s.offsetY, s.radius, color, s.opacity) };
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: s.offsetY },
    shadowOpacity: s.opacity,
    shadowRadius: s.radius,
    elevation: s.elevation,
  };
}

/** True while the mouse pointer is over a pressable. Only React Native Web reports it; on a phone it is always false. */
export function isHovered(state: { pressed: boolean }): boolean {
  return (state as { hovered?: boolean }).hovered === true;
}

/** True while the person has asked their phone or browser to cut back on movement. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => alive && setReduce(on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}
