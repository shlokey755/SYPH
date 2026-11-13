/**
 * animatedEmoji.ts
 * Where the animated version of an emoji lives. No React, no native code, no network, so plain Node can test it.
 *
 * Google's Noto Emoji Animation (CC BY 4.0) gives many emoji a real animation: the gorilla stands up and beats its chest, the
 * heart pulses, and so on. The files are served free from Google's font CDN, one folder per emoji named by its code points:
 *
 *   https://fonts.gstatic.com/s/e/notoemoji/latest/<code points>/512.webp   (animated WebP)
 *   https://fonts.gstatic.com/s/e/notoemoji/latest/<code points>/512.gif    (the same as a GIF)
 *
 * <code points> is lowercase hex joined by "_", keeping U+FE0F where the emoji has it: 1f98d (gorilla), 263a_fe0f (smiling
 * face), 2764_fe0f_200d_1f525 (heart on fire). Not every emoji has an animation. The project publishes the list of the ones
 * that do (`NOTO_LIST_URL`); with that list a missing emoji is known up front, without it every guess is tried and a 404 means
 * "no animation".
 *
 * Not checked against the live CDN from the build environment (it cannot reach it): the layout above comes from Google's
 * published documentation and scripts.
 */

export const NOTO_ANIMATION_BASE = 'https://fonts.gstatic.com/s/e/notoemoji/latest';
export const NOTO_LIST_URL = 'https://googlefonts.github.io/noto-emoji-animation/data/api.json';

/** Emoji messages with more emoji than this are shown big and still (a pop-in), to spare the network and the battery. */
export const MAX_ANIMATED_IMAGES = 3;

const FE0F = 'fe0f';
const SKIN_TONE = /^1f3f[b-f]$/;
const CODE = /^[0-9a-f]{2,6}(?:_[0-9a-f]{2,6})*$/;

/** The code points of an emoji as lowercase hex strings: 🦍 gives ["1f98d"], ☺️ gives ["263a", "fe0f"]. */
export const emojiCodepoints = (emoji: string): string[] =>
  Array.from(emoji, (ch) => (ch.codePointAt(0) as number).toString(16));

/** The way the emoji is typed: its code points joined by "_" (FE0F kept). */
export const typedCode = (emoji: string): string => emojiCodepoints(emoji).join('_');

/** The way emoji are matched against the list: FE0F left out, so ☺ and ☺️ are the same emoji. */
export const lookupKey = (code: string): string =>
  code
    .toLowerCase()
    .split('_')
    .filter((part) => part !== FE0F)
    .join('_');

/** A skin-toned emoji: the animation set only has the default yellow ones. */
export const hasSkinTone = (emoji: string): boolean => emojiCodepoints(emoji).some((part) => SKIN_TONE.test(part));

/**
 * Pulls the code points out of the published list. Anything that is not the shape we expect (a changed file, an error page)
 * gives an empty list, which callers treat as "list unknown". Takes unknown input because it comes straight from the network.
 */
export function parseAnimatedList(json: unknown): string[] {
  const icons = (json as { icons?: unknown } | null | undefined)?.icons;
  if (!Array.isArray(icons)) return [];
  const codes: string[] = [];
  for (const icon of icons) {
    const code = (icon as { codepoint?: unknown } | null | undefined)?.codepoint;
    if (typeof code === 'string' && CODE.test(code.toLowerCase())) codes.push(code.toLowerCase());
  }
  return codes;
}

/** Indexes the list for lookups: matching key (no FE0F) to the folder name to use. */
export function buildIndex(codes: readonly string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const code of codes) index.set(lookupKey(code), code);
  return index;
}

const urls = (code: string) => [`${NOTO_ANIMATION_BASE}/${code}/512.webp`, `${NOTO_ANIMATION_BASE}/${code}/512.gif`];

/**
 * The addresses to try for an emoji, best first, or none when it has no animation.
 *   - list known: its folder as the list names it (WebP, then GIF), or none when it is not listed
 *   - list unknown (offline on first use, or the file changed): the folder as typed, and without FE0F, as WebP then GIF;
 *     a 404 on all of them means no animation
 * Skin-toned emoji have none.
 */
export function animationUrls(emoji: string, index: ReadonlyMap<string, string> | null): string[] {
  if (hasSkinTone(emoji)) return [];
  if (index && index.size > 0) {
    const code = index.get(lookupKey(typedCode(emoji)));
    return code ? urls(code) : [];
  }
  const typed = typedCode(emoji);
  const plain = lookupKey(typed);
  const guesses = typed === plain ? [typed] : [typed, plain];
  return guesses.flatMap((code) => urls(code).slice(0, 1)).concat(urls(typed).slice(1));
}

/** Size (px) of the animation by how many emoji there are: one is big, three still fit a bubble. */
export function animationSize(count: number): number {
  if (count <= 1) return 112;
  if (count === 2) return 88;
  return 72;
}
