/**
 * colors.ts
 * The colours of the app. There is one look: a pirate's torn map. Aged parchment, sepia ink, deep sea blue, brass and wax red.
 * No React, no native code, so plain Node can test it (tests/unit/colors.test.ts).
 *
 * Two ways to write on this page:
 *   - straight on the page (`background`): `text`, `subText`, `accent`, `danger`,
 *   - on a piece of paper pinned to it (`paper`, `paperAlt`): `ink`, `inkSoft`, `stamp`.
 * `accent` filled with `buttonText` on top is a flat button or one of your own message slips.
 * Full-screen call and media screens use the night sea instead (`night`, `nightInk`, `nightSoft`).
 */

export interface ThemeColors {
  /** The page: what is behind everything. The colour of the parchment picture. */
  background: string;
  /** A raised surface. Same as `paper`; the older name, still read by screens that were not redrawn. */
  cardBackground: string;
  /** Text on the page. */
  text: string;
  /** Secondary text on the page. */
  subText: string;
  /** Main colour: flat buttons, your own message slips, the active tab, links on the page. Deep sea blue. */
  accent: string;
  /** Hairlines on the page. */
  border: string;
  inputBg: string;
  /** Text/icon colour used on top of `accent` and `stamp`. */
  buttonText: string;
  /** Errors and destructive actions. */
  danger: string;
  /** Always false: the page is light. Kept for the status bar and for code written when themes could be dark. */
  isDark: boolean;

  /** A fresh piece of parchment: cards, message slips, inputs, sheets. */
  paper: string;
  /** A second stock, tea-stained, so a page is not one flat colour. */
  paperAlt: string;
  /** Text on `paper` and `paperAlt`. */
  ink: string;
  /** Secondary text on `paper` and `paperAlt`. */
  inkSoft: string;
  /** Wax and X-marks-the-spot red: highlights, badges and links on paper. */
  stamp: string;
  /** The dotted and dashed trail drawn on the map. */
  trail: string;
  /** The shadow under a piece of paper. */
  shadow: string;
  /** What pins, tacks and seals are made of: brass, sea-green and wax red. Decorative, never put text on them. */
  pins: readonly [string, string, string];
  /** Brass, for medallion rims and nail heads. */
  brass: string;
  /** Polished gold, for text and icons on the timber and on the night sea: the active tab, titles on a call. */
  gilt: string;
  /** Ship's timber, behind the plank buttons and the tab bar. */
  wood: string;
  /** The burnt rim of the map, and the dark table it lies on (web). */
  burn: string;

  /** The night sea, for full-screen calls and media. */
  night: string;
  /** Text on `night`. */
  nightInk: string;
  /** Secondary text on `night`. */
  nightSoft: string;
}

export const vintage: ThemeColors = {
  background: '#E3CC9A',
  cardBackground: '#F3E5BD',
  text: '#33200F',
  subText: '#6A4A2B',
  accent: '#1E4B5C',
  border: '#B79B66',
  inputBg: '#F3E5BD',
  buttonText: '#F6EBC9',
  danger: '#8E1F16',
  isDark: false,

  paper: '#F3E5BD',
  paperAlt: '#DCC48E',
  ink: '#33200F',
  inkSoft: '#6A4A2B',
  stamp: '#8F2619',
  trail: 'rgba(58, 36, 18, 0.55)',
  shadow: '#2A190B',
  pins: ['#C79A2E', '#4F8A8B', '#B3392B'],
  brass: '#B8892B',
  gilt: '#F2D27A',
  wood: '#5C3A1E',
  burn: '#2A190B',

  night: '#14232E',
  nightInk: '#EBD9AE',
  nightSoft: '#B9A987',
};
