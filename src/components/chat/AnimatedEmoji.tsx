/**
 * AnimatedEmoji.tsx
 * A message that is only emoji: each emoji pops in (a springy bounce with a little wiggle, one after another), then floats
 * gently up and down. Tap it to make it pop again. Plain React Native Animated on the native driver, no extra packages.
 *
 * The idle float is skipped when the phone has "reduce motion" on, and it stops when the bubble leaves the screen.
 * Long-press still opens the message menu: the tap target passes it on.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { emojiSize } from '../../utils/emoji';
import { NATIVE_DRIVER } from '../parchment';

interface Props {
  emojis: string[];
  onLongPress?: () => void;
}

const STAGGER_MS = 90;

function usePhoneReducesMotion(): React.MutableRefObject<boolean> {
  const reduced = useRef(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) reduced.current = value;
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return reduced;
}

export function AnimatedEmoji({ emojis, onLongPress }: Props) {
  const size = emojiSize(emojis.length);
  const reduced = usePhoneReducesMotion();
  // One pair of values per emoji: `pop` for the entrance, `float` for the idle movement.
  const values = useMemo(
    () => emojis.map(() => ({ pop: new Animated.Value(0), float: new Animated.Value(0) })),
    [emojis]
  );
  const floats = useRef<Animated.CompositeAnimation[]>([]);

  const play = useCallback(() => {
    floats.current.forEach((loop) => loop.stop());
    floats.current = [];
    values.forEach(({ pop, float }) => {
      pop.setValue(0);
      float.setValue(0);
    });
    if (reduced.current) {
      values.forEach(({ pop }) => pop.setValue(1));
      return;
    }
    Animated.stagger(
      STAGGER_MS,
      values.map(({ pop }) => Animated.spring(pop, { toValue: 1, friction: 3.5, tension: 120, useNativeDriver: NATIVE_DRIVER }))
    ).start(({ finished }) => {
      if (!finished) return;
      floats.current = values.map(({ float }, index) => {
        const loop = Animated.loop(
          Animated.sequence([
            Animated.delay(index * 220),
            Animated.timing(float, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_DRIVER }),
            Animated.timing(float, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_DRIVER }),
          ])
        );
        loop.start();
        return loop;
      });
    });
  }, [values, reduced]);

  useEffect(() => {
    play();
    return () => {
      floats.current.forEach((loop) => loop.stop());
      floats.current = [];
      values.forEach(({ pop, float }) => {
        pop.stopAnimation();
        float.stopAnimation();
      });
    };
  }, [play, values]);

  return (
    <Pressable onPress={play} onLongPress={onLongPress} delayLongPress={250} accessibilityLabel={emojis.join(' ')}>
      <View style={styles.row}>
        {emojis.map((emoji, index) => {
          const { pop, float } = values[index];
          return (
            <Animated.Text
              key={`${index}-${emoji}`}
              style={[
                styles.emoji,
                {
                  fontSize: size,
                  lineHeight: Math.round(size * 1.25),
                  opacity: pop.interpolate({ inputRange: [0, 0.25], outputRange: [0, 1], extrapolate: 'clamp' }),
                  transform: [
                    { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
                    { scale: Animated.multiply(pop, float.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] })) },
                    { rotate: pop.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-18deg', '10deg', '0deg'] }) },
                  ],
                },
              ]}
            >
              {emoji}
            </Animated.Text>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  emoji: { marginHorizontal: 1 },
});
