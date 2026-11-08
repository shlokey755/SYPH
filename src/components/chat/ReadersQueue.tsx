/**
 * ReadersQueue.tsx
 * The avatar queue under a message you sent in a group while only some of the group have seen it: up to three overlapping
 * avatars (then a "+N"), no text. Tap it for the "Read by" list. When the last person sees the message the queue shrinks and
 * fades away over about 0.2 s (the bubble goes hollow at the same moment), and it is not drawn at all once gone.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../../hooks/themeContext';
import { queueSplit, Reader } from '../../utils/receipts';
import { InitialAvatar } from './InitialAvatar';

const AVATAR = 22;
const OVERLAP = 8;

interface Props {
  readers: Reader[];
  /** True while the queue should be on screen; false animates it away. */
  show: boolean;
  /** First letter source per person (their username), by uid. */
  names: Record<string, string>;
  colors: ThemeColors;
  onPress: () => void;
}

export function ReadersQueue({ readers, show, names, colors, onPress }: Props) {
  const [mounted, setMounted] = useState(show);
  const progress = useRef(new Animated.Value(show ? 1 : 0)).current;

  useEffect(() => {
    if (show) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [show, progress]);

  if (!mounted || readers.length === 0) return null;
  const { shown, extra } = queueSplit(readers);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`${readers.length} ${readers.length === 1 ? 'person has' : 'people have'} read this message. Open the list`}
      style={styles.wrap}
    >
      <Animated.View
        style={[
          styles.row,
          { opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
        ]}
      >
        {shown.map((reader, index) => (
          <View key={reader.uid} style={index > 0 ? styles.overlapped : undefined}>
            <InitialAvatar name={names[reader.uid] ?? ''} size={AVATAR} colors={colors} ring={colors.background} />
          </View>
        ))}
        {extra > 0 && (
          <View
            style={[
              styles.overlapped,
              styles.more,
              { backgroundColor: colors.cardBackground, borderColor: colors.background },
            ]}
          >
            <Text style={[styles.moreText, { color: colors.text }]}>+{extra}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-end', marginRight: 14, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  overlapped: { marginLeft: -OVERLAP },
  more: {
    height: AVATAR,
    minWidth: AVATAR,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { fontSize: 10, fontWeight: '700' },
});
