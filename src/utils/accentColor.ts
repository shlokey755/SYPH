/**
 * accentColor.ts
 * The maths behind the colour wheel (Me tab > Accent colour). Pure logic, unit tested in Node.
 *
 * The wheel picks a hue (0 to 359 degrees). A hue alone is not a usable colour on every background, so this file turns it
 * into one: the same hue is made brighter on a dark theme and darker on a light one, until it is about as readable as the
 * built-in accents are. Text on top of it is black or white, whichever reads better.
 *
 * The launcher icon cannot be recoloured while the app runs (Android only swaps between icons that were baked into the
 * app), so 12 icons exist, one every 30 degrees, and the wheel's hue picks the closest one. scripts/make-hue-icons.py paints
 * them with `hueIconAccents()` below, so the icon and the app use the same colours.
 *
 * Utils do not import each other by value (the Node tests load them one by one), so nothing is imported here.
 */

/** Degrees between two neighbouring launcher icons. */
export const HUE_ICON_STEP = 30;
export const HUE_ICON_COUNT = 360 / HUE_ICON_STEP;

/** Names of the launcher icons in app.json: hue000, hue030, ... hue330. The name is also the Android resource name. */
export const HUE_ICON_NAMES: string[] = Array.from(
  { length: HUE_ICON_COUNT },
  (_, index) => `hue${String(index * HUE_ICON_STEP).padStart(3, '0')}`
);

/** A hue as a whole number from 0 to 359, whatever was given (-30 is 330, 360 is 0). */
export const normalizeHue = (hue: number): number => ((Math.round(hue) % 360) + 360) % 360;

/** A hue read back from storage or a profile: a number or a numeric string; anything else is "no hue". */
export function hueOf(value: unknown): number | null {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? normalizeHue(number) : null;
}

/**
 * The hue saved on a profile: a number, `null` when the person went back to their theme's own colour, and `undefined` when
 * the profile has no such field (an account that never used the wheel) or holds something unreadable.
 */
export function profileHueOf(value: unknown): number | null | undefined {
  if (value === null) return null;
  return hueOf(value) ?? undefined;
}

type Rgb = [number, number, number];

/** HSL (hue in degrees, saturation and lightness 0 to 1) as 0 to 255 channels. */
function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const k = (n: number) => (n + hue / 30) % 12;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const f = (n: number) => lightness - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

const toHex = (rgb: Rgb): string => `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

function fromHex(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance([r, g, b]: Rgb): number {
  const linear = (channel: number) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * How the accent is made on each kind of theme. The lightness is searched between `low` and `high` for the one whose
 * luminance is `target`; a hue that cannot reach it (blue is always dark) simply ends at the nearest end.
 * Dark themes: 50% lightness at full saturation is the Cyber theme's own #00E5FF, give or take a shade, at hue 186.
 */
const DARK = { saturation: 1, low: 0.5, high: 0.72, target: 0.3 };
const LIGHT = { saturation: 0.85, low: 0.14, high: 0.4, target: 0.09 };

/** The accent colour for a hue on a dark or a light theme, as `#RRGGBB`. */
export function accentForHue(hue: number, isDark: boolean): string {
  const h = normalizeHue(hue);
  const { saturation, low, high, target } = isDark ? DARK : LIGHT;
  const lum = (lightness: number) => luminance(hslToRgb(h, saturation, lightness));
  if (lum(low) >= target) return toHex(hslToRgb(h, saturation, low));
  if (lum(high) <= target) return toHex(hslToRgb(h, saturation, high));
  let lo = low;
  let hi = high;
  for (let step = 0; step < 24; step += 1) {
    const middle = (lo + hi) / 2;
    if (lum(middle) < target) lo = middle;
    else hi = middle;
  }
  return toHex(hslToRgb(h, saturation, (lo + hi) / 2));
}

/** Black or white, whichever is easier to read on `accent`. */
export function textOnAccent(accent: string): string {
  const rgb = fromHex(accent);
  if (!rgb) return '#000000';
  const lum = luminance(rgb);
  const onBlack = (lum + 0.05) / 0.05;
  const onWhite = 1.05 / (lum + 0.05);
  return onBlack >= onWhite ? '#000000' : '#FFFFFF';
}

/** What the wheel changes in a theme: the accent, and the text that sits on it. */
export function accentColors(hue: number, isDark: boolean): { accent: string; buttonText: string } {
  const accent = accentForHue(hue, isDark);
  return { accent, buttonText: textOnAccent(accent) };
}

/** The launcher icon (a name from HUE_ICON_NAMES) closest to this hue. */
export function iconNameForHue(hue: number): string {
  return HUE_ICON_NAMES[Math.round(normalizeHue(hue) / HUE_ICON_STEP) % HUE_ICON_COUNT];
}

/** For scripts/make-hue-icons.py: every launcher icon, its hue and the accent it is painted with (as on a dark theme). */
export const hueIconAccents = (): { name: string; hue: number; accent: string }[] =>
  HUE_ICON_NAMES.map((name, index) => ({
    name,
    hue: index * HUE_ICON_STEP,
    accent: accentForHue(index * HUE_ICON_STEP, true),
  }));
