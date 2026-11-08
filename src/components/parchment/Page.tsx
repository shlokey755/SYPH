/**
 * Page.tsx
 * The page everything is pinned to. Wrap a screen's content in `Page` instead of a plain View with a background colour.
 *
 * - `variant="map"` (the default): the full pirate map, with burnt edges, folds and an inked island chart. Main screens, sign-in.
 * - `variant="plain"`: the same parchment with nothing drawn on it. Chats and long reading, where nothing should compete with text.
 * - `variant="night"`: a dark sea chart. Full-screen calls and media; text on it is `nightInk`.
 *
 * The picture fills the page and keeps its shape (it is cropped, never squashed), so the keyboard coming up does not distort it.
 */

import React from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/themeContext';
import { ART } from './art';

export type PageVariant = 'map' | 'plain' | 'night';

const PICTURE = { map: ART.map, plain: ART.plain, night: ART.night } as const;

/** Just the picture, for screens that cannot use `Page` (a modal with its own container). */
export function PageTexture({ variant = 'map' }: { variant?: PageVariant }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image source={PICTURE[variant]} resizeMode="cover" style={StyleSheet.absoluteFill} />
    </View>
  );
}

export interface PageProps {
  children?: React.ReactNode;
  variant?: PageVariant;
  style?: StyleProp<ViewStyle>;
}

export function Page({ children, variant = 'map', style }: PageProps) {
  const { themeColors: c } = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: variant === 'night' ? c.night : c.background }, style]}>
      <PageTexture variant={variant} />
      {children}
    </View>
  );
}
