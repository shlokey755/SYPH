import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
      style={[styles.banner, { backgroundColor: themeColors.cardBackground, borderBottomColor: themeColors.border }]}
    >
      <Ionicons name="cloud-offline-outline" size={16} color={themeColors.subText} />
      <Text style={[styles.text, { color: themeColors.text }]} numberOfLines={2}>
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
    borderBottomWidth: 1,
  },
  text: { flex: 1, fontSize: 12 },
});
