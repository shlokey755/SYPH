/**
 * linkify.ts
 * Finds the web links in a piece of message text so they can be tapped. Pure logic, unit tested in Node.
 *
 * What counts as a link, and why it is this strict (a wrong guess turns ordinary words blue):
 * - `http://` and `https://` addresses, and `www.` addresses, in any letter case.
 * - A bare address such as `youtube.com/watch?v=...` or `bit.ly/3x`, but only with a common ending (`.com`, `.org`, `.in`, ...) in
 *   lower case, and not when it follows `@` (an email address), a letter, a digit or one of `. - / : % + = & ~ # ?`. So `e.g.`,
 *   `file.txt`, `7.5.5`, `Done.In` and `me@example.com` stay plain text.
 * - Punctuation that ends the sentence is not part of the link ("see https://a.com/x." links `https://a.com/x`), and a closing
 *   bracket is left out unless the link opened one itself (`https://en.wikipedia.org/wiki/Foo_(bar)` keeps its bracket).
 *
 * Only `http` and `https` addresses are ever produced: nothing else (`javascript:`, `file:`, `tel:`, `intent:`) is made tappable.
 * The parts always add up to the original text, character for character.
 */

export interface TextPart {
  text: string;
  /** The address to open when this part is a link; always starts with http:// or https://. */
  url?: string;
}

/** Endings accepted for an address typed without `http://` or `www.`. */
const BARE_ENDINGS = [
  'com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'in', 'app', 'dev', 'ai', 'xyz', 'info', 'biz', 'tv', 'gg', 'ly', 'me', 'us', 'uk',
  'ca', 'au', 'de', 'fr', 'jp', 'link', 'site', 'online', 'store', 'tech', 'page', 'cloud', 'blog', 'news', 'live', 'chat',
];

const SCHEME = '[Hh][Tt][Tt][Pp][Ss]?:\\/\\/[^\\s<>]+';
const WWW = '[Ww][Ww][Ww]\\.[^\\s<>]+';
const BARE =
  `(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+(?:${BARE_ENDINGS.join('|')})(?![A-Za-z0-9-])` +
  '(?::\\d{1,5})?(?:[/?#][^\\s<>]*)?';

/** A link that starts with `http://`, `https://` or `www.` only may not start in the middle of a word ("xhttps://..."). */
const NOT_BEFORE_ADDRESS = /[\p{L}\p{N}]/u;

/** A bare address may not follow a word, an email address's `@` or part of a longer address: that is what keeps `me@a.com`, `v1.2.in` and `/x/y.com` plain. */
const NOT_BEFORE_BARE = /[\p{L}\p{N}@._\-/:%+=&~#?\\]/u;

const HAS_START = /^(?:https?:\/\/|www\.)/i;

const CLOSING: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const SENTENCE_END = /[.,;:!?'"]/;

/** The match without the punctuation that belongs to the sentence around it. */
function trimEnd(raw: string): string {
  let end = raw.length;
  while (end > 0) {
    const last = raw[end - 1];
    if (SENTENCE_END.test(last)) {
      end -= 1;
    } else if (CLOSING[last]) {
      const inside = raw.slice(0, end);
      const closed = inside.split(last).length - 1;
      const opened = inside.split(CLOSING[last]).length - 1;
      if (closed > opened) end -= 1;
      else break;
    } else {
      break;
    }
  }
  return raw.slice(0, end);
}

/** The address as it is opened: `https://` is added to `www.` and bare addresses, and the scheme is lower case. */
export function linkUrl(link: string): string {
  if (/^https?:\/\//i.test(link)) return link.replace(/^[Hh][Tt][Tt][Pp][Ss]?/, (scheme) => scheme.toLowerCase());
  return `https://${link}`;
}

/** Whether what was matched is really an address (and not `https://`, `www.`, `http://.` ...). */
function isAddress(link: string): boolean {
  if (/^https?:\/\//i.test(link)) {
    const host = link.replace(/^https?:\/\//i, '').split(/[/?#]/, 1)[0];
    if (!/[A-Za-z0-9]/.test(host)) return false;
    return /^localhost(?::\d+)?$/i.test(host) || /^[^.\s]+(?:\.[^.\s]+)+(?::\d+)?$/.test(host.replace(/^[^@]*@/, ''));
  }
  if (/^www\./i.test(link)) return /^www\.[A-Za-z0-9-]+\.[A-Za-z]{2,}/i.test(link);
  return true;
}

/** The text cut into plain parts and link parts, in order. */
export function splitLinks(text: string): TextPart[] {
  if (!text) return [];
  const pattern = new RegExp(`${SCHEME}|${WWW}|${BARE}`, 'g');
  const parts: TextPart[] = [];
  let done = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const start = match.index;
    if (start > 0 && (HAS_START.test(match[0]) ? NOT_BEFORE_ADDRESS : NOT_BEFORE_BARE).test(text[start - 1])) continue;
    // Two addresses joined by a comma ("https://a.com,https://b.org") are two links.
    const second = match[0].slice(1).search(/https?:\/\//i);
    const link = trimEnd(second === -1 ? match[0] : match[0].slice(0, second + 1));
    if (!link || !isAddress(link)) continue;
    if (start > done) parts.push({ text: text.slice(done, start) });
    parts.push({ text: link, url: linkUrl(link) });
    done = start + link.length;
    pattern.lastIndex = done; // what follows a cut or trimmed link is looked at again
  }
  if (done < text.length) parts.push({ text: text.slice(done) });
  return parts;
}
