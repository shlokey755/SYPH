/**
 * InitialAvatar.tsx
 * A square avatar with the person's initial. SYPH has no profile photos (no file storage), so this is every avatar.
 * `ring` draws a border in the given colour, which is how overlapping avatars are told apart.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../../hooks/themeContext';

interface Props {
  name: string;
  size: number;
  colors: ThemeColors;
  ring?: string;
}

export const initialOf = (name: string | undefined): string => (name?.trim() ? Array.from(name.trim())[0].toUpperCase() : '?');

export function InitialAvatar({ name, size, colors, ring }: Props) {
  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          backgroundColor: colors.accent,
          borderWidth: ring ? 2 : 0,
          borderColor: ring,
        },
      ]}
    >
      <Text style={{ color: colors.buttonText, fontSize: Math.round(size * 0.45), fontWeight: '700' }}>{initialOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
