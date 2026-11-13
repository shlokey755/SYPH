/**
 * wideArt.ts
 * The landscape pages for a desktop browser window. Only the web build carries them (wideArt.web.ts): on a phone this is null, so
 * the app does not ship two pictures it never draws.
 */
import type { ImageSourcePropType } from 'react-native';

export const WIDE_ART: { map: ImageSourcePropType; plain: ImageSourcePropType } | null = null;
