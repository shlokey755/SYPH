import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './parchment';
import { useTheme } from '../hooks/themeContext';
import { useIsOffline } from '../hooks/useOnlineStatus';

interface Props {
  /** What the offline state means on this screen. */
  message: string;
}

/** Slim strip shown only while the device is offline. Renders nothing otherwise. */
export function OfflineBanner({ message }: Props) {
  const { themeColors } = useTheme();
  const offline = useIsOffline();
  if (!offline) return null;

  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: themeColors.paperAlt, borderBottomColor: themeColors.brass }]}
    >
      <Ionicons name="cloud-offline-outline" size={18} color={themeColors.stamp} />
      <Text kind="hand" style={[styles.text, { color: themeColors.ink }]} numberOfLines={2}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 2,
  },
  text: { flex: 1, fontSize: 17, lineHeight: 20 },
});
