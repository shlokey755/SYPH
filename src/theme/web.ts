/**
 * web.ts
 * How the app sits in a browser window. On a phone, or a narrow window, the map fills the screen like it does in the app.
 * On a wide window it would be a stretched, mostly empty page, so it becomes a column of map lying on a dark ship's table.
 * No React, no native code, so plain Node can test it (tests/unit/web.test.ts). The frame itself is components/parchment/WebFrame.tsx.
 */

/** From this window width on, the map is a column on the table. Below it the map fills the window. */
export const DESK_MIN_WIDTH = 720;

/** The width of the map column on the table. A phone-sized column: every screen is laid out for it. */
export const COLUMN_WIDTH = 480;

export interface DeskLayout {
  /** True when the map is a column on the table. */
  desk: boolean;
  /** The width of the map: the column's, or null when it fills the window. */
  columnWidth: number | null;
}

export function deskLayout(windowWidth: number): DeskLayout {
  if (!Number.isFinite(windowWidth) || windowWidth < DESK_MIN_WIDTH) return { desk: false, columnWidth: null };
  return { desk: true, columnWidth: COLUMN_WIDTH };
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
