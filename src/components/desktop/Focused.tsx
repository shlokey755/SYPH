/**
 * Focused.tsx
 * Hides a tab's screen while another tab is open. The tab navigator keeps every tab it has shown mounted and, on the web, leaves
 * the hidden ones in place behind the open one. That went unseen while each tab painted an opaque background; on a desktop window
 * the screens are transparent (the map is the shell's), so the hidden tabs showed through the open one. display: 'none' takes
 * them out of view without unmounting them, so a half-typed field or a scroll position is still there when the tab comes back.
 */

import { useIsFocused } from 'expo-router';
import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

export function Focused({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  return <View style={focused ? styles.shown : styles.hidden}>{children}</View>;
}

const styles = StyleSheet.create({
  shown: { flex: 1 },
  hidden: { display: 'none' },
});
