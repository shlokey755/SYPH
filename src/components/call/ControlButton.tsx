/**
 * ControlButton.tsx
 * The round buttons on the call screens (mute, speaker, camera, switch camera). Highlighted while switched on.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/themeContext';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}

export function ControlButton({ icon, label, active, onPress }: Props) {
  const { themeColors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[
        styles.round,
        { backgroundColor: active ? themeColors.accent : themeColors.cardBackground, borderColor: themeColors.border },
      ]}
    >
      <Ionicons name={icon} size={24} color={active ? themeColors.buttonText : themeColors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Five buttons (mute, speaker, camera, switch camera, hang up) must fit a 360dp-wide screen: 5 x 56 + 4 x 10 = 320.
  round: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
