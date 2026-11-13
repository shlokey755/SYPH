/**
 * Trail.tsx
 * A dotted trail across the page, like the route to the treasure: a divider. Draw it once or twice per screen; it is
 * a row of dots, so it is not meant to be repeated inside a long list.
 */

import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/mapTheme';
import { Text } from './Text';

export interface TrailLineProps {
  /** Ends in an X, where the treasure is. */
  x?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

const DOTS = '· '.repeat(90);

export function TrailLine({ x = false, color, style }: TrailLineProps) {
  const { themeColors: c } = useTheme();
  const tint = color ?? c.trail;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 16 }, style]}
    >
      <Text numberOfLines={1} ellipsizeMode="clip" allowFontScaling={false} style={{ flex: 1, color: tint, fontSize: 15, lineHeight: 16 }}>
        {DOTS}
      </Text>
      {x ? (
        <Text kind="display" allowFontScaling={false} style={{ color: c.stamp, fontSize: 22, lineHeight: 22 }}>
          ✕
        </Text>
      ) : null}
    </View>
  );
}
