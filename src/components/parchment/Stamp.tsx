/**
 * Stamp.tsx
 * `Stamp` is a rubber stamp pressed on the paper (NEW, MUTED, PINNED); `CountSeal` is a wax seal with a number in it, for unread counts.
 */

import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/themeContext';
import { withAlpha } from '../../theme/parchment';
import { WaxSeal } from './Pins';
import { Text } from './Text';

export interface StampProps {
  label: string;
  /** `wax` red, `ink` brown, `sea` blue. */
  tone?: 'wax' | 'ink' | 'sea';
  /** Degrees. */
  angle?: number;
  style?: StyleProp<ViewStyle>;
}

/** A rubber stamp: small capitals in a double frame, a little crooked, a little faded. */
export function Stamp({ label, tone = 'wax', angle = -5, style }: StampProps) {
  const { themeColors: c } = useTheme();
  const color = tone === 'ink' ? c.ink : tone === 'sea' ? c.accent : c.stamp;
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[
        {
          alignSelf: 'flex-start',
          transform: [{ rotate: `${angle}deg` }],
          borderWidth: 2,
          borderColor: withAlpha(color, 0.85),
          borderRadius: 3,
          padding: 2,
          opacity: 0.92,
        },
        style,
      ]}
    >
      <View style={{ borderWidth: 1, borderColor: withAlpha(color, 0.85), borderRadius: 2, paddingHorizontal: 7, paddingVertical: 1 }}>
        <Text kind="label" style={{ color, fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase' }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

export interface CountSealProps {
  count: number;
  /** Counts above this show as `max+`. */
  max?: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** A wax seal with an unread count pressed into it. Draws nothing for zero. */
export function CountSeal({ count, max = 99, size = 30, style }: CountSealProps) {
  const { themeColors: c } = useTheme();
  if (!(count > 0)) return null;
  const text = count > max ? `${max}+` : String(count);
  const wide = text.length > 2;
  return (
    <View accessible accessibilityLabel={`${count} unread`} style={style}>
      <WaxSeal color={c.stamp} size={wide ? size + 6 : size} angle={count % 2 ? -8 : 7}>
        <Text
          allowFontScaling={false}
          style={{ color: c.buttonText, fontSize: wide ? 11 : 13, lineHeight: 16, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 }}
        >
          {text}
        </Text>
      </WaxSeal>
    </View>
  );
}
