/**
 * Unfurl.tsx
 * Makes what it holds roll open like a scroll, instead of just appearing: it grows down from its top edge (or up from the
 * bottom) while fading in. Wrap toasts, sheets and panels that arrive on top of the screen. It plays once, when it first shows.
 * With "reduce motion" on, it just appears.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import { NATIVE_DRIVER, useReduceMotion } from './platform';

export interface UnfurlProps {
  children?: React.ReactNode;
  /** Where it is attached: `top` unrolls downwards, `bottom` upwards (a sheet rising from the bottom edge). */
  from?: 'top' | 'bottom';
  /** Milliseconds to wait before starting. */
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

export function Unfurl({ children, from = 'top', delay = 0, duration = 320, style }: UnfurlProps) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      delay,
      duration,
      easing: Easing.out(Easing.back(1.1)),
      useNativeDriver: NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [reduce, progress, delay, duration]);

  const direction = from === 'top' ? -1 : 1;
  return (
    <Animated.View
      style={[
        {
          opacity: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] }),
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [direction * 16, 0] }) },
            { scaleY: progress.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
          ],
          transformOrigin: from === 'top' ? 'top' : 'bottom',
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
