/**
 * LocationBubble.tsx
 * The body of a live-location message: says whether the share is still on and opens the map when tapped.
 * It needs no listener of its own: the end time is stored on the message, so it only compares that with the clock.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Message } from '../../types';
import { bubbleStatus } from '../../utils/location';

interface Props {
  message: Message;
  textColor: string;
  onOpen?: (message: Message) => void;
  /** The long-press menu lives on the outer bubble, which a nested Pressable would otherwise swallow. */
  onLongPress?: (message: Message) => void;
}

const TICK_MS = 30_000;

export function LocationBubble({ message, textColor, onOpen, onLongPress }: Props) {
  const expiresAt = message.location?.expiresAt ?? 0;
  const [now, setNow] = useState(() => Date.now());

  // Re-check every so often while live, and once more right when it ends.
  useEffect(() => {
    if (!(expiresAt > Date.now())) return;
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    const end = setTimeout(() => setNow(Date.now()), Math.max(0, expiresAt - Date.now()) + 250);
    return () => {
      clearInterval(tick);
      clearTimeout(end);
    };
  }, [expiresAt]);

  const status = bubbleStatus(expiresAt, now);

  return (
    <Pressable
      onPress={() => onOpen?.(message)}
      onLongPress={() => onLongPress?.(message)}
      delayLongPress={250}
      accessibilityRole="button"
      accessibilityLabel={`${status.label}. Open map`}
      style={styles.row}
    >
      <View style={[styles.icon, { borderColor: textColor }]}>
        <Ionicons name={status.live ? 'location' : 'location-outline'} size={22} color={textColor} />
      </View>
      <View style={styles.texts}>
        <Text style={[styles.title, { color: textColor }]}>{status.label}</Text>
        <Text style={[styles.hint, { color: textColor }]}>{status.live ? 'Tap to see where they are' : 'Tap to see the last position'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 },
  icon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  texts: { flexShrink: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, opacity: 0.8 },
});
