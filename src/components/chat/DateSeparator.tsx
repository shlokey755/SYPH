/**
 * DateSeparator.tsx
 * The day label of a chat: "Today", "Yesterday", "Saturday, 31 Oct". `DayChip` is the small rounded label itself; it is used
 * above the first message of each day (`DateSeparator`) and as the floating label that follows you while you scroll.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../../hooks/themeContext';

export function DayChip({ label, colors }: { label: string; colors: ThemeColors }) {
  return (
    <View style={[styles.chip, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.subText }]}>{label}</Text>
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
  chip: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 4 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
});
