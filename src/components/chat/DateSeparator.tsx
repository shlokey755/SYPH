/**
 * DateSeparator.tsx
 * The day label above the first message of each day: a line, the label, a line. Plain text between straight rules.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../../hooks/themeContext';

export function DateSeparator({ label, colors }: { label: string; colors: ThemeColors }) {
  return (
    <View style={styles.row} accessibilityRole="header">
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
      <Text style={[styles.label, { color: colors.subText }]}>{label}</Text>
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
});
