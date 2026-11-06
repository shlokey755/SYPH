/**
 * emoji.ts
 * Tells whether a message is nothing but emoji (so it can be shown big and animated) and splits it into its emoji.
 * No React, no native code, no Unicode property escapes (Hermes does not support all of them), so plain Node can test it.
 *
 * An emoji here is what a phone keyboard types as one: a pictograph, optionally followed by a variation selector and a skin
 * tone, joined to more of them with zero-width joiners (family, profession, couple emoji), a pair of regional indicators
 * (a flag), a flag with tag characters (England, Scotland), or a keycap (1 followed by U+FE0F and U+20E3).
 * Spaces and line breaks between emoji are allowed and ignored.
 */

/** A message with more emoji than this is shown as ordinary text, so a long run does not become a huge bubble. */
export const MAX_ANIMATED_EMOJI = 8;

/** The most characters looked at; anything longer is not an emoji-only message. */
const MAX_LENGTH = 96;

const ZWJ = 0x200d;
const VS16 = 0xfe0f;
const KEYCAP = 0x20e3;

const inRange = (cp: number, from: number, to: number) => cp >= from && cp <= to;
const isRegional = (cp: number) => inRange(cp, 0x1f1e6, 0x1f1ff);
const isSkinTone = (cp: number) => inRange(cp, 0x1f3fb, 0x1f3ff);
const isTag = (cp: number) => inRange(cp, 0xe0020, 0xe007f);
const isSpace = (cp: number) => cp === 0x20 || cp === 0x0a || cp === 0x0d || cp === 0x09 || cp === 0xa0;

/**
 * Pictographs that show as text unless followed by U+FE0F (©, ™, ↔ and friends). A keyboard types them with the selector;
 * without it, they are ordinary characters and do not make an emoji-only message.
 */
const NEEDS_SELECTOR: readonly (readonly [number, number])[] = [
  [0xa9, 0xa9],
  [0xae, 0xae],
  [0x203c, 0x203c],
  [0x2049, 0x2049],
  [0x2122, 0x2122],
  [0x2139, 0x2139],
  [0x2194, 0x2199],
  [0x21a9, 0x21aa],
  [0x2328, 0x2328],
  [0x23cf, 0x23cf],
  [0x23ed, 0x23ef],
  [0x23f1, 0x23f2],
  [0x23f8, 0x23fa],
  [0x24c2, 0x24c2],
  [0x25aa, 0x25ab],
  [0x25b6, 0x25b6],
  [0x25c0, 0x25c0],
  [0x25fb, 0x25fc],
];

/** Code points that are emoji with or without a selector. */
const EMOJI: readonly (readonly [number, number])[] = [
  [0x231a, 0x231b],
  [0x23e9, 0x23ec],
  [0x23f0, 0x23f0],
  [0x23f3, 0x23f3],
  [0x25fd, 0x25fe],
  [0x2600, 0x27bf], // weather, symbols and dingbats: ☀ ☺ ❤ ✨ ✅ ❌ ...
  [0x2934, 0x2935],
  [0x2b05, 0x2b07],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x3030, 0x3030],
  [0x303d, 0x303d],
  [0x3297, 0x3297],
  [0x3299, 0x3299],
  [0x1f000, 0x1faff], // everything from mahjong tiles through the newest pictographs
];

const inRanges = (cp: number, ranges: readonly (readonly [number, number])[]) =>
  ranges.some(([from, to]) => inRange(cp, from, to));

/** The emoji (one entry per emoji as it is shown) in `text`, or null when `text` has anything else in it. */
export function splitEmoji(text: string | undefined | null): string[] | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_LENGTH) return null;
  const cps = Array.from(text, (ch) => ch.codePointAt(0) as number);
  const out: string[] = [];
  let i = 0;

  const take = (from: number, to: number) => String.fromCodePoint(...cps.slice(from, to));

  while (i < cps.length) {
    if (isSpace(cps[i])) {
      i++;
      continue;
    }
    const start = i;
    const cp = cps[i];

    if (isRegional(cp)) {
      // A flag is exactly two regional indicators.
      if (i + 1 >= cps.length || !isRegional(cps[i + 1])) return null;
      i += 2;
    } else if (((cp >= 0x30 && cp <= 0x39) || cp === 0x23 || cp === 0x2a) && i + 1 < cps.length) {
      // Keycap: 1️⃣ is "1", optional U+FE0F, U+20E3.
      let j = i + 1;
      if (cps[j] === VS16) j++;
      if (cps[j] !== KEYCAP) return null;
      i = j + 1;
    } else if (inRanges(cp, EMOJI) || inRanges(cp, NEEDS_SELECTOR)) {
      if (!inRanges(cp, EMOJI) && cps[i + 1] !== VS16) return null;
      i++;
      // The rest of one emoji: selector, skin tone, tag characters (flag of England...), and joined emoji (👨‍👩‍👧).
      for (;;) {
        if (cps[i] === VS16 || isSkinTone(cps[i]) || isTag(cps[i]) || cps[i] === KEYCAP) {
          i++;
        } else if (cps[i] === ZWJ && i + 1 < cps.length && (inRanges(cps[i + 1], EMOJI) || inRanges(cps[i + 1], NEEDS_SELECTOR))) {
          i += 2;
        } else {
          break;
        }
      }
    } else {
      return null;
    }
    out.push(take(start, i));
    if (out.length > MAX_ANIMATED_EMOJI) return null;
  }
  return out.length > 0 ? out : null;
}

/** The emoji to animate when the message is only emoji (1 to MAX_ANIMATED_EMOJI of them), otherwise null. */
export const emojiOnly = (text: string | undefined | null): string[] | null => splitEmoji(text);

/** Font size by how many emoji there are: one is big, a handful smaller, so a row of them still fits a bubble. */
export function emojiSize(count: number): number {
  if (count <= 1) return 52;
  if (count === 2) return 44;
  if (count === 3) return 38;
  if (count <= 5) return 32;
  return 26;
}
