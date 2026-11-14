/**
 * platform.ts
 * The few places where the phone and the browser need different styles. Everything else in components/parchment is the same code
 * on both, so a screen that uses these pieces looks the same in the app and on the web.
 */

import { createContext, useEffect, useState } from 'react';
import { AccessibilityInfo, ImageStyle, Platform, ViewStyle, useWindowDimensions } from 'react-native';
import { shadowSpec } from '../../theme/parchment';
import { type DesktopLayout, SHEET_WIDTH, boxShadowCss, desktopLayout } from '../../theme/web';

export const IS_WEB = Platform.OS === 'web';

/**
 * The style of an Image that fills its parent. React Native Web gives an Image the size of its file before it reads `style`, so
 * left/right/top/bottom alone leave it as big as the file (a torn edge hundreds of points wide); the 100% settles it. Use this, in an
 * array with any tint or transform: spreading StyleSheet.absoluteFill into an object loses its parts on the web.
 */
export const FILL_IMAGE: ImageStyle = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' };

/**
 * For the outer box of a bottom sheet or a centred panel inside a `Modal`. A Modal on the web is drawn over the whole browser window,
 * so without this a sheet would stretch across a desktop monitor. On a phone it changes nothing.
 */
export const SHEET_FRAME: ViewStyle = { width: '100%', maxWidth: SHEET_WIDTH, alignSelf: 'center' };

/** A full-height picker (forward, GIFs, group info) as a card in the middle of a desktop browser window instead of a wall. */
export const DIALOG_FRAME: ViewStyle = {
  ...SHEET_FRAME,
  marginVertical: 24,
  borderRadius: 4,
  overflow: 'hidden',
  boxShadow: '0px 12px 40px rgba(0, 0, 0, 0.5)',
};

const PHONE: DesktopLayout = { desktop: false, railWidth: 0, listWidth: 0 };

/** The desktop layout when this is a browser window wide enough for it (theme/web.ts), the phone layout everywhere else. */
export function useDesktopLayout(): DesktopLayout {
  const { width } = useWindowDimensions();
  return IS_WEB ? desktopLayout(width) : PHONE;
}

/** True inside the desktop shell's panes: the shell has already painted the page, so a screen must not paint its own over it. */
export const InShellContext = createContext(false);

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
