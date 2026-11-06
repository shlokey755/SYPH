/**
 * bubbleColors.ts
 * Colours for the messages you send: the theme's accent, a little darker, with text and ticks that stay readable on it.
 * No React, no native code, so plain Node can test it.
 *
 *   - `darkenColor`      a colour a little darker (each channel scaled towards black)
 *   - `contrastRatio`    WCAG contrast between two colours (1 = none, 21 = black on white)
 *   - `ownBubbleColors`  background, text and tick colours for a sent message
 */

export type Rgb = readonly [number, number, number];

/** How much darker than the theme accent a sent message is. Slight: it should still read as the theme colour. */
export const OWN_BUBBLE_DARKEN = 0.18;

/** Ticks that are not "read yet" (sent, delivered) are drawn at this opacity of the text colour. */
export const IDLE_TICK_OPACITY = 0.7;

/** "Read" tick colours, tried in this order: a light blue, a deeper blue, a navy. The first that shows up well is used. */
export const READ_TICK_CANDIDATES = ['#7FC8FF', '#0B4FD8', '#00296B'] as const;

/** Enough contrast for an icon (WCAG asks 3:1 for graphics) and for body text. */
const ICON_CONTRAST = 3;
const TEXT_CONTRAST = 4.5;

/** Reads `#RGB` or `#RRGGBB` (the alpha of `#RRGGBBAA` is ignored). Anything else is null. */
export function parseHex(value: string | undefined | null): Rgb | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim();
  let match = /^#([0-9a-fA-F]{3})$/.exec(hex);
  if (match) {
    const [r, g, b] = match[1].split('').map((digit) => parseInt(digit + digit, 16));
    return [r, g, b];
  }
  match = /^#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/.exec(hex);
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const channel = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const toHex = ([r, g, b]: Rgb): string => `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();

/** `amount` is 0 (unchanged) to 1 (black). A colour that cannot be read comes back as it was. */
export function darkenColor(value: string, amount: number = OWN_BUBBLE_DARKEN): string {
  const rgb = parseHex(value);
  if (!rgb) return value;
  const keep = 1 - Math.max(0, Math.min(1, amount));
  return toHex([rgb[0] * keep, rgb[1] * keep, rgb[2] * keep]);
}

const linear = (n: number): number => {
  const s = n / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

const luminance = ([r, g, b]: Rgb): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** WCAG contrast ratio, 1 to 21. A colour that cannot be read counts as black. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(parseHex(a) ?? [0, 0, 0]);
  const lb = luminance(parseHex(b) ?? [0, 0, 0]);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The preferred text colour when it reads well on `background`, else whichever of white and black reads better. */
export function readableTextOn(background: string, preferred?: string): string {
  if (preferred && parseHex(preferred) && contrastRatio(preferred, background) >= TEXT_CONTRAST) return preferred;
  return contrastRatio('#FFFFFF', background) >= contrastRatio('#000000', background) ? '#FFFFFF' : '#000000';
}

export interface OwnBubbleColors {
  /** Bubble fill: the accent, a little darker. */
  background: string;
  /** Message text and the clock. */
  text: string;
  /** The tick colour once the message is read. */
  readTick: string;
}

/**
 * The look of a message you sent. `accent` is the theme's accent and `preferredText` its colour for text on the accent
 * (kept when it still reads well on the darker fill).
 */
export function ownBubbleColors(accent: string, preferredText?: string): OwnBubbleColors {
  const background = darkenColor(accent);
  const text = readableTextOn(background, preferredText);
  const readTick = READ_TICK_CANDIDATES.find((candidate) => contrastRatio(candidate, background) >= ICON_CONTRAST) ?? text;
  return { background, text, readTick };
}
