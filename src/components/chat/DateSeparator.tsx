/**
 * DateSeparator.tsx
 * The day label of a chat: "Today", "Yesterday", "Saturday, 31 Oct". `DayChip` is the small label itself, a squared-off box
 * (not a pill) in the same small capitals as the section titles on the Me tab; it is used
 * above the first message of each day (`DateSeparator`) and as the floating label that follows you while you scroll.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../parchment';
import { ThemeColors } from '../../hooks/themeContext';

export function DayChip({ label, colors }: { label: string; colors: ThemeColors }) {
  return (
    <View style={[styles.chip, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.subText }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function DateSeparator({ label, colors }: { label: string; colors: ThemeColors }) {
  return (
    <View style={styles.row} accessibilityRole="header">
      <DayChip label={label} colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  // Corner radius 4, the same as the tail corner of a message bubble: squared off, never a pill.
  chip: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
});
