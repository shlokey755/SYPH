/**
 * fonts.ts
 * The map's typefaces: the files, loading them, and whether they can be used.
 *
 * They are bundled with the JavaScript (assets/fonts), so a new look reaches phones through an over-the-air update like any
 * other change: expo-font itself is already in the installed app (the icon font needs it). In a browser the same call writes
 * the @font-face rules, and with static rendering Expo copies the files into the page so they can be preloaded.
 *
 * Text that is drawn before a font is registered keeps the system font for good, so nothing is shown until they are
 * loaded: app/_layout.tsx renders nothing, with the splash still up, until `useMapFonts` says true.
 */

import { useFonts } from 'expo-font';
import { FONT } from './parchment';

export const MAP_FONT_SOURCES = {
  [FONT.display]: require('../../assets/fonts/PirataOne-Regular.ttf'),
  [FONT.body]: require('../../assets/fonts/CrimsonText-Regular.ttf'),
  [FONT.bodyBold]: require('../../assets/fonts/CrimsonText-Bold.ttf'),
  [FONT.bodyItalic]: require('../../assets/fonts/CrimsonText-Italic.ttf'),
  [FONT.bodyBoldItalic]: require('../../assets/fonts/CrimsonText-BoldItalic.ttf'),
  [FONT.label]: require('../../assets/fonts/IMFellEnglishSC-Regular.ttf'),
  [FONT.hand]: require('../../assets/fonts/IMFellEnglish-Italic.ttf'),
};

let usable = true;

/** False when loading the fonts failed: text then keeps the system font and its own weight. */
export function mapFontsUsable(): boolean {
  return usable;
}

/** Loads the map's typefaces. True once they are ready, or once loading has failed (the app then runs on system fonts). */
export function useMapFonts(): boolean {
  const [loaded, error] = useFonts(MAP_FONT_SOURCES);
  if (error) usable = false;
  return loaded || error != null;
}
