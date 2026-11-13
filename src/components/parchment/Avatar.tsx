/**
 * Avatar.tsx
 * A person (or a group) as a round brass medallion: a brass rim around a parchment face with their initial in blackletter.
 * The rim colour comes from the name, so a person looks the same everywhere. A photo, when there is one, replaces the face.
 */

import React from 'react';
import { Image, StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/mapTheme';
import { initialOf, mixColors, pick } from '../../theme/parchment';
import { paperShadow } from './platform';
import { Text } from './Text';

export interface AvatarProps {
  /** Whose initial to show. */
  name?: string | null;
  /** Shown instead of the initial, for a group or a placeholder (e.g. an Ionicons glyph in `themeColors.ink`). */
  icon?: React.ReactNode;
  /** A photo. Shown in place of the initial. */
  uri?: string | null;
  /** Diameter. */
  size?: number;
  /** What the rim colour comes from. Defaults to the name. */
  seed?: string | number;
  style?: StyleProp<ViewStyle>;
}

export function Avatar({ name, icon, uri, size = 48, seed, style }: AvatarProps) {
  const { themeColors: c } = useTheme();
  const rim = pick([c.brass, c.pins[1], c.pins[2]], seed ?? name ?? '?');
  const edge = mixColors(rim, '#000000', 0.5);
  const ring = Math.max(2, Math.round(size * 0.09));
  const face = size - ring * 2;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: rim,
          borderWidth: 1,
          borderColor: edge,
          padding: ring - 1,
        },
        paperShadow(c.shadow, 1),
        style,
      ]}
    >
      <View
        style={{
          width: face - 2,
          height: face - 2,
          borderRadius: face / 2,
          backgroundColor: c.paperAlt,
          borderWidth: 1,
          borderColor: edge,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: face, height: face }} resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : (
          icon ?? (
            <Text
              kind="display"
              allowFontScaling={false}
              style={{ color: c.ink, fontSize: Math.round(face * 0.62), lineHeight: Math.round(face * 0.82) }}
            >
              {initialOf(name)}
            </Text>
          )
        )}
      </View>
    </View>
  );
}
