/**
 * DateSeparator.tsx
 * The day label of a chat: "Today", "Yesterday", "Saturday, 31 Oct", drawn as a ribbon pinned across the page.
 * `DayChip` is the ribbon itself; it is used above the first message of each day (`DateSeparator`) and as the floating
 * label that follows you while you scroll.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemeColors } from '../../hooks/themeContext';
import { Banner } from '../parchment';

// `colors` is still passed by the callers; the ribbon takes its colours from the theme itself.
export function DayChip({ label }: { label: string; colors?: ThemeColors }) {
  return <Banner tone="paper">{label}</Banner>;
}

export function DateSeparator({ label, colors }: { label: string; colors?: ThemeColors }) {
  return (
    <View style={styles.row}>
      <DayChip label={label} colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
});
