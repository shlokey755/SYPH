/**
 * parchment.ts
 * The rules behind the pirate-map look that need no screen: which typeface a piece of text gets, how far a scrap of paper is
 * turned, how deep its shadow is, and a few colour helpers. No React, no native code, so plain Node can test it
 * (tests/unit/parchment.test.ts). The pieces themselves (paper, pins, planks, seals, ...) are in components/parchment/.
 */

/** The names the typefaces are registered under (see theme/fonts.ts, which holds the files). */
export const FONT = {
  /** Blackletter lettering, like a ship's name on a stern. Headlines. */
  display: 'PirataOne',
  /** An old-style serif: message text and everything that is read. */
  body: 'CrimsonText',
  bodyBold: 'CrimsonText-Bold',
  bodyItalic: 'CrimsonText-Italic',
  bodyBoldItalic: 'CrimsonText-BoldItalic',
  /** Small capitals from an old printing house, for button captions, tags and small labels. */
  label: 'IMFellEnglishSC',
  /** An old italic, as if written with a quill: notes in the margin. */
  hand: 'IMFellEnglishItalic',
} as const;

export type TextKind = 'body' | 'display' | 'label' | 'hand';

export interface ResolvedFont {
  fontFamily: string;
  /** Always normal: the weight is already part of the family, and a second, synthetic bold would smear the letters. */
  fontWeight: 'normal';
  fontStyle: 'normal';
}

/** True for `bold` and for 600 and up, in any of the spellings React Native accepts. */
export function isBold(weight: string | number | undefined): boolean {
  if (weight === 'bold') return true;
  if (weight === undefined) return false;
  const n = typeof weight === 'number' ? weight : parseInt(weight, 10);
  return Number.isFinite(n) && n >= 600;
}

/**
 * The typeface for a piece of text. Only the body face has bold and italic cuts, so for the other three kinds the weight
 * and slant that a style asks for are ignored instead of being faked.
 */
export function resolveFont(kind: TextKind, weight?: string | number, fontStyle?: string): ResolvedFont {
  const italic = fontStyle === 'italic';
  let fontFamily: string;
  if (kind === 'display') fontFamily = FONT.display;
  else if (kind === 'label') fontFamily = FONT.label;
  else if (kind === 'hand') fontFamily = FONT.hand;
  else if (isBold(weight)) fontFamily = italic ? FONT.bodyBoldItalic : FONT.bodyBold;
  else fontFamily = italic ? FONT.bodyItalic : FONT.body;
  return { fontFamily, fontWeight: 'normal', fontStyle: 'normal' };
}

/** A stable number for a string or number: the same seed always gives the same value (FNV-1a). */
export function hashSeed(seed: string | number): number {
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * How far a scrap of paper is turned, in degrees: between -max and max, to a tenth, and the same every time for the same seed.
 * A message keeps its angle when the list redraws, and two messages next to each other rarely lean the same way.
 */
export function tilt(seed: string | number, max = 1.2): number {
  const unit = (hashSeed(seed) % 2001) / 1000 - 1;
  return Math.round(unit * max * 10) / 10 || 0;
}

/** One of `items`, chosen by the seed. */
export function pick<T>(items: readonly T[], seed: string | number): T {
  return items[hashSeed(seed) % items.length];
}

/** `#RGB` or `#RRGGBB` as `rgba(r, g, b, alpha)`. Anything else comes back as it was. */
export function withAlpha(color: string, alpha: number): string {
  const rgb = readHex(color);
  if (!rgb) return color;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

/** `#RGB`, `#RRGGBB` or `#RRGGBBAA` as [r, g, b], or null for anything else. */
function readHex(color: string): [number, number, number] | null {
  const hex = color.trim();
  let match = /^#([0-9a-fA-F]{3})$/.exec(hex);
  let digits: string | null = null;
  if (match) digits = match[1].split('').map((d) => d + d).join('');
  else {
    match = /^#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/.exec(hex);
    if (match) digits = match[1];
  }
  if (!digits) return null;
  const n = parseInt(digits, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * `from` blended toward `to`: 0 gives `from`, 1 gives `to`. Both must be hex colours; otherwise `from` comes back as it was.
 * `mixColors(brass, '#000000', 0.4)` is a darker brass for a rim, `mixColors(paper, '#FFFFFF', 0.5)` a lighter paper.
 */
export function mixColors(from: string, to: string, amount: number): string {
  const a = readHex(from);
  const b = readHex(to);
  if (!a || !b) return from;
  const t = Math.max(0, Math.min(1, amount));
  const channel = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t).toString(16).padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`.toUpperCase();
}

/** The first letter of a name, capitalised (a whole emoji counts as one letter), or `?`. */
export function initialOf(name: string | null | undefined): string {
  const first = Array.from((name ?? '').trim())[0];
  return first ? first.toUpperCase() : '?';
}

/** How high a scrap of paper lies above the page: 0 flat on it, 3 held up in the hand. */
export type Lift = 0 | 1 | 2 | 3;

export interface ShadowSpec {
  /** How far down the shadow falls, in points. */
  offsetY: number;
  /** How soft its edge is. */
  radius: number;
  opacity: number;
  /** Android's own shadow depth. */
  elevation: number;
}

const SHADOWS: Record<Lift, ShadowSpec> = {
  0: { offsetY: 0, radius: 0, opacity: 0, elevation: 0 },
  1: { offsetY: 1, radius: 2, opacity: 0.22, elevation: 1 },
  2: { offsetY: 3, radius: 5, opacity: 0.3, elevation: 3 },
  3: { offsetY: 7, radius: 11, opacity: 0.38, elevation: 7 },
};

/** The shadow for a lift. Out-of-range numbers are held to the nearest lift. */
export function shadowSpec(lift: number): ShadowSpec {
  const clamped = Math.max(0, Math.min(3, Math.round(lift))) as Lift;
  return SHADOWS[clamped];
}
