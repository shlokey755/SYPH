/**
 * web.ts
 * How the app sits in a browser window. A phone, or a window narrower than DESKTOP_MIN_WIDTH, gets the phone layout filling the
 * window, with the tab bar at the bottom. From DESKTOP_MIN_WIDTH up it is a desktop layout: a plank rail down the left, the list of
 * chats beside it, and the open page (a conversation, Add, Me) taking the rest. Nothing stretches across a whole monitor either:
 * reading text, forms and pop-ups each have a widest size.
 * No React, no native code, so plain Node can test it (tests/unit/web.test.ts). The pieces are components/desktop/DesktopShell.tsx.
 */

/** From this window width on, the app is the desktop layout. */
export const DESKTOP_MIN_WIDTH = 900;
/** The plank rail with the Chats, Add and Me buttons. */
export const RAIL_WIDTH = 84;
/** The list of chats beside the rail; a little narrower on a window just over the minimum, so the open page keeps its room. */
export const LIST_WIDTH = 360;
export const LIST_WIDTH_NARROW = 320;
export const LIST_NARROW_BELOW = 1100;
/** The least room the open page keeps next to the rail and the list. */
export const MAIN_MIN_WIDTH = 480;
/** The widest the text of a conversation gets, the widest a form page (Add, Me) gets, and the widest a pop-up gets. */
export const READING_WIDTH = 820;
export const FORM_WIDTH = 640;
export const SHEET_WIDTH = 560;

export interface DesktopLayout {
  /** True when the app is the desktop layout. */
  desktop: boolean;
  railWidth: number;
  listWidth: number;
}

export function desktopLayout(windowWidth: number): DesktopLayout {
  if (!Number.isFinite(windowWidth) || windowWidth < DESKTOP_MIN_WIDTH) return { desktop: false, railWidth: 0, listWidth: 0 };
  return { desktop: true, railWidth: RAIL_WIDTH, listWidth: windowWidth < LIST_NARROW_BELOW ? LIST_WIDTH_NARROW : LIST_WIDTH };
}

/**
 * A CSS box-shadow for the web, from the same numbers the app uses for its own shadows. React Native Web turns `shadow*` styles
 * into this too, but warns about them; writing `boxShadow` ourselves keeps the console clean.
 */
export function boxShadowCss(offsetY: number, radius: number, color: string, opacity: number): string {
  if (opacity <= 0) return 'none';
  const rgb = /^#([0-9a-fA-F]{6})/.exec(color.trim());
  const base = rgb ? parseInt(rgb[1], 16) : 0;
  const alpha = Math.max(0, Math.min(1, opacity));
  return `0px ${offsetY}px ${radius}px rgba(${(base >> 16) & 255}, ${(base >> 8) & 255}, ${base & 255}, ${alpha})`;
}
