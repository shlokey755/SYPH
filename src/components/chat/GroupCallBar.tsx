/**
 * GroupCallBar.tsx
 * The bar under a group chat's header while a call is going: "Video call in progress - 2 people in the call" and a
 * Join button. Hidden when the call is over, so a stale call never shows a dead Join button.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../../hooks/themeContext';
import { CallType } from '../../types';
import { participantCountLabel } from '../../utils/groupCall';

interface Props {
  type: CallType;
  /** People in the call, or null while still loading. */
  count: number | null;
  colors: ThemeColors;
  onJoin: () => void;
}

export function GroupCallBar({ type, count, colors, onJoin }: Props) {
  const kind = type === 'video' ? 'Video' : 'Voice';
  return (
    <View style={[styles.bar, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
      <Ionicons name={type === 'video' ? 'videocam' : 'call'} size={20} color={colors.accent} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.text }]}>{kind} call in progress</Text>
        {count !== null && <Text style={[styles.sub, { color: colors.subText }]}>{participantCountLabel(count)}</Text>}
      </View>
      <Pressable
        onPress={onJoin}
        accessibilityRole="button"
        accessibilityLabel={`Join the ${kind.toLowerCase()} call`}
        style={[styles.join, { backgroundColor: colors.accent }]}
      >
        <Text style={[styles.joinText, { color: colors.buttonText }]}>Join</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  text: { flex: 1 },
  title: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 12 },
  join: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18 },
  joinText: { fontSize: 14, fontWeight: '700' },
});
