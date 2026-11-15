/**
 * CallPlank.tsx
 * The strip of ship's planking along the bottom of the call screens in a browser, with the call buttons lying on it. Only the
 * browser's call screens (call/[id].web.tsx, group-call/[id].web.tsx) use it, so a phone never loads it.
 */

import React, { ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/mapTheme';
import { ART, FILL_IMAGE } from '../parchment';

export function CallPlank({ children }: { children: ReactNode }) {
  const { themeColors: c } = useTheme();
  return (
    <View style={[styles.plank, { backgroundColor: c.wood }]}>
      <Image source={ART.wood} resizeMode="cover" style={FILL_IMAGE} />
      <View pointerEvents="none" style={[styles.edge, { backgroundColor: c.brass }]} />
      <View style={styles.row}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  plank: { overflow: 'hidden' },
  edge: { position: 'absolute', left: 0, right: 0, top: 0, height: 3 },
  // Narrow windows wrap the buttons onto a second row instead of clipping them.
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 18,
  },
});
