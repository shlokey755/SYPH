/**
 * Page.tsx
 * The page everything is pinned to. Wrap a screen's content in `Page` instead of a plain View with a background colour.
 *
 * - `variant="map"` (the default): the full pirate map, with burnt edges, folds and an inked island chart. Main screens, sign-in.
 * - `variant="plain"`: the same parchment with nothing drawn on it. Chats and long reading, where nothing should compete with text.
 * - `variant="night"`: a dark sea chart. Full-screen calls and media; text on it is `nightInk`.
 *
 * The picture fills the page and keeps its shape (it is cropped, never squashed), so the keyboard coming up does not distort it.
 * In a desktop browser window the landscape pictures are used instead, and inside the desktop shell (components/desktop) the shell has
 * painted one page for the whole pane already, so a `Page` there is transparent and draws no picture of its own.
 */
import React, { useContext } from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';
import { useTheme } from '../../theme/mapTheme';
import { ART } from './art';
import { FILL_IMAGE, InShellContext, IS_WEB } from './platform';
import { WIDE_ART } from './wideArt';

export type PageVariant = 'map' | 'plain' | 'night';

const PICTURE = { map: ART.map, plain: ART.plain, night: ART.night } as const;

/** Just the picture, for screens that cannot use `Page` (a modal with its own container). `force` paints it inside the shell too. */
export function PageTexture({ variant = 'map', force = false }: { variant?: PageVariant; force?: boolean }) {
  const inShell = useContext(InShellContext);
  const { width, height } = useWindowDimensions();
  if (inShell && !force) return null;
  const landscape = IS_WEB && WIDE_ART !== null && width >= 700 && width > height * 1.1 && variant !== 'night';
  const source = landscape && WIDE_ART ? (variant === 'map' ? WIDE_ART.map : WIDE_ART.plain) : PICTURE[variant];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image source={source} resizeMode="cover" style={FILL_IMAGE} />
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
  const inShell = useContext(InShellContext);
  const background = inShell ? 'transparent' : variant === 'night' ? c.night : c.background;
  return (
    <View style={[{ flex: 1, backgroundColor: background }, style]}>
      <PageTexture variant={variant} />
      {children}
    </View>
  );
}
