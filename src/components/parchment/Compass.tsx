/**
 * Compass.tsx
 * A compass rose. `Compass` is the picture (it can turn); `Loading` is what to show instead of a spinner while something loads.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ImageStyle, StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/mapTheme';
import { ART } from './art';
import { NATIVE_DRIVER } from './platform';
import { Text } from './Text';

export interface CompassProps {
  size?: number;
  /** Defaults to the ink colour. */
  color?: string;
  /** Turns round and round, easing in and out like a hand spinning the rose. */
  spin?: boolean;
  style?: StyleProp<ImageStyle>;
}

export function Compass({ size = 40, color, spin = false, style }: CompassProps) {
  const { themeColors: c } = useTheme();
  const turn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!spin) return;
    turn.setValue(0);
    const loop = Animated.loop(
      Animated.timing(turn, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.cubic), useNativeDriver: NATIVE_DRIVER })
    );
    loop.start();
    return () => loop.stop();
  }, [spin, turn]);

  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.Image
      source={ART.compass}
      resizeMode="contain"
      tintColor={color ?? c.ink}
      style={[{ width: size, height: size, transform: [{ rotate }] }, style]}
    />
  );
}

export interface LoadingProps {
  size?: number;
  /** A line of handwriting under the compass: "Charting the course...". */
  label?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/** A turning compass, with an optional note. Use it wherever a spinner would go. */
export function Loading({ size = 44, label, color, style }: LoadingProps) {
  const { themeColors: c } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
      style={[{ alignItems: 'center', justifyContent: 'center', gap: 6 }, style]}
    >
      <Compass spin size={size} color={color ?? c.ink} />
      {label ? (
        <Text kind="hand" style={{ color: color ?? c.subText, fontSize: 18, lineHeight: 22, textAlign: 'center' }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
