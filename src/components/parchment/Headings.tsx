/**
 * Headings.tsx
 * Lettering for the top of a screen and for breaking one up.
 *
 *   PageTitle  the screen's name in blackletter, with a line of handwriting under it, and room for a button on the right
 *   HeroTitle  a big centred title with a dotted trail and a note under it: sign-in, onboarding, call screens
 *   Note       a line of handwriting in the margin
 *   Banner     a ribbon with a word on it: date separators, section headings
 */

import React from 'react';
import { StyleProp, TextStyle, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/mapTheme';
import { Text } from './Text';
import { TrailLine } from './Trail';

export interface PageTitleProps {
  title: string;
  /** Handwriting under the title. */
  note?: string;
  /** Something on the right: a button. */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function PageTitle({ title, note, right, style }: PageTitleProps) {
  const { themeColors: c } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }, style]}>
      <View style={{ flexShrink: 1 }}>
        <Text
          kind="display"
          accessibilityRole="header"
          style={{
            color: c.text,
            fontSize: 46,
            lineHeight: 52,
            textShadowColor: 'rgba(255, 238, 190, 0.75)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 0,
          }}
        >
          {title}
        </Text>
        {note ? (
          <Text kind="hand" style={{ color: c.subText, fontSize: 18, lineHeight: 22, marginTop: -6 }}>
            {note}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export interface HeroTitleProps {
  title: string;
  note?: string;
  /** Size of the lettering. */
  size?: number;
  /** Colours for use on the night sea instead of the parchment. */
  night?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function HeroTitle({ title, note, size = 60, night = false, style }: HeroTitleProps) {
  const { themeColors: c } = useTheme();
  const ink = night ? c.nightInk : c.text;
  return (
    <View style={[{ alignItems: 'center', gap: 2 }, style]}>
      <Text
        kind="display"
        accessibilityRole="header"
        style={{
          color: ink,
          fontSize: size,
          lineHeight: Math.round(size * 1.12),
          textAlign: 'center',
          textShadowColor: night ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 238, 190, 0.75)',
          textShadowOffset: { width: 0, height: night ? 2 : 1 },
          textShadowRadius: night ? 3 : 0,
        }}
      >
        {title}
      </Text>
      <TrailLine x color={night ? c.nightSoft : undefined} style={{ alignSelf: 'stretch', marginHorizontal: 28 }} />
      {note ? (
        <Text kind="hand" style={{ color: night ? c.nightSoft : c.subText, fontSize: 19, lineHeight: 24, textAlign: 'center' }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

export interface NoteProps {
  children?: React.ReactNode;
  /** Colours for use on paper (ink) instead of straight on the page. */
  onPaper?: boolean;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
}

/** A line of quill handwriting. */
export function Note({ children, onPaper = false, numberOfLines, style }: NoteProps) {
  const { themeColors: c } = useTheme();
  return (
    <Text
      kind="hand"
      numberOfLines={numberOfLines}
      style={[{ color: onPaper ? c.inkSoft : c.subText, fontSize: 18, lineHeight: 22 }, style]}
    >
      {children}
    </Text>
  );
}

export interface BannerProps {
  children: string;
  /** `wax` red (the default), `sea` blue, `brass` gold, `paper` tea-stained parchment. */
  tone?: 'wax' | 'sea' | 'brass' | 'paper';
  style?: StyleProp<ViewStyle>;
}

const BANNER_HEIGHT = 26;
const BANNER_TAIL = 11;

/** A ribbon with pointed ends and a word on it. */
export function Banner({ children, tone = 'wax', style }: BannerProps) {
  const { themeColors: c } = useTheme();
  const fill = tone === 'sea' ? c.accent : tone === 'brass' ? c.pins[0] : tone === 'paper' ? c.paperAlt : c.stamp;
  const ink = tone === 'brass' || tone === 'paper' ? c.ink : c.buttonText;
  const tail = { width: 0, height: 0, borderTopWidth: BANNER_HEIGHT / 2, borderBottomWidth: BANNER_HEIGHT / 2, borderTopColor: 'transparent', borderBottomColor: 'transparent' } as const;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={children} style={[{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center' }, style]}>
      <View style={{ ...tail, borderRightWidth: BANNER_TAIL, borderRightColor: fill }} />
      <View style={{ height: BANNER_HEIGHT, backgroundColor: fill, paddingHorizontal: 12, justifyContent: 'center' }}>
        <Text kind="label" allowFontScaling={false} style={{ color: ink, fontSize: 14, lineHeight: 18, letterSpacing: 1.4 }}>
          {children}
        </Text>
      </View>
      <View style={{ ...tail, borderLeftWidth: BANNER_TAIL, borderLeftColor: fill }} />
    </View>
  );
}
