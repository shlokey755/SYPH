/**
 * Pins.tsx
 * What holds things to the map: brass tacks and blobs of sealing wax. Both are decoration and never take a press.
 */

import React from 'react';
import { Image, StyleProp, View, ViewStyle } from 'react-native';
import { mixColors } from '../../theme/parchment';
import { ART } from './art';
import { FILL_IMAGE, paperShadow } from './platform';

export interface TackProps {
  /** Usually one of `themeColors.pins`. */
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** A round-headed brass tack with a highlight, seen from the front. */
export function Tack({ color, size = 16, style }: TackProps) {
  const rim = mixColors(color, '#000000', 0.5);
  return (
    <View
      pointerEvents="none"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          borderWidth: Math.max(1, size / 14),
          borderColor: rim,
        },
        paperShadow('#000000', 2),
        style,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          left: size * 0.16,
          top: size * 0.12,
          width: size * 0.36,
          height: size * 0.3,
          borderRadius: size,
          backgroundColor: mixColors(color, '#FFFFFF', 0.7),
          opacity: 0.85,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: size * 0.1,
          bottom: size * 0.08,
          width: size * 0.5,
          height: size * 0.32,
          borderRadius: size,
          backgroundColor: mixColors(color, '#000000', 0.28),
          opacity: 0.5,
        }}
      />
    </View>
  );
}

export interface WaxSealProps {
  /** The wax: usually `themeColors.stamp`. */
  color: string;
  size?: number;
  /** Turn the seal so two next to each other do not look stamped by the same hand. Degrees. */
  angle?: number;
  /** What is pressed into the wax: a number, a glyph. Drawn in `buttonText`-style colour by the caller. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** A blob of sealing wax with a ragged edge and a stamped ring. Put a count or a small icon in it. */
export function WaxSeal({ color, size = 30, angle = 0, children, style }: WaxSealProps) {
  return (
    <View
      pointerEvents="none"
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Image
        source={ART.seal}
        resizeMode="stretch"
        tintColor="#000000"
        style={[FILL_IMAGE, { opacity: 0.3, top: size * 0.05, transform: [{ rotate: `${angle}deg` }] }]}
      />
      <Image
        source={ART.seal}
        resizeMode="stretch"
        tintColor={color}
        style={[FILL_IMAGE, { transform: [{ rotate: `${angle}deg` }] }]}
      />
      <Image
        source={ART.sealRing}
        resizeMode="stretch"
        tintColor={mixColors(color, '#000000', 0.45)}
        style={[FILL_IMAGE, { transform: [{ rotate: `${angle}deg` }] }]}
      />
      {children}
    </View>
  );
}
