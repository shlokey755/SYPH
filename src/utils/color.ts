/**
 * color.ts
 * Small colour helpers. No React, no native code, so plain Node can test it.
 */

/** Reads `#RGB` or `#RRGGBB` (the alpha of `#RRGGBBAA` is ignored). Anything else is null. */
export function parseHex(value: string | undefined | null): [number, number, number] | null {
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

/**
 * The same colour with an opacity from 0 to 1, as `rgba(...)`. Fading between a colour and `withAlpha(colour, 0)` keeps the
 * hue steady, where fading to the word "transparent" can pass through grey on some phones. A colour that cannot be read
 * gives "transparent".
 */
export function withAlpha(value: string, alpha: number): string {
  const rgb = parseHex(value);
  if (!rgb) return 'transparent';
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}
