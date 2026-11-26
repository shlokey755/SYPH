/**
 * AccentSection.tsx
 * Me tab > Accent colour: the colour wheel, which lays one hue over the chosen theme (buttons, your message bubbles, the active tab,
 * links) and changes the launcher icon to the closest of 12 colours. "Use the theme's own colour" undoes it; choosing a theme
 * above does the same. State lives in hooks/themeContext.tsx. Phone only: a browser has no wheel.
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../../hooks/themeContext';
import { ColorWheel } from './ColorWheel';

export function AccentSection() {
  const { themeColors, accentHue, setAccentHue } = useTheme();
  const { width } = useWindowDimensions();
  // The section has 15 points of padding on each side and the card 16 inside a 1 point border.
  const size = Math.max(180, Math.min(280, width - 2 * 15 - 2 * 17));

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: themeColors.subText }]}>Accent colour</Text>
      <View style={[styles.card, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
        <ColorWheel
          size={size}
          hue={accentHue}
          accent={themeColors.accent}
          onAccent={themeColors.buttonText}
          isDark={themeColors.isDark}
          markerColor={themeColors.text}
          onCommit={setAccentHue}
        />
        <Text style={[styles.hint, { color: themeColors.subText }]}>
          Drag around the ring. Buttons, your messages and the app icon take the colour you pick.
        </Text>
        {Platform.OS === 'android' ? (
          <Text style={[styles.hint, { color: themeColors.subText }]}>
            The icon is the closest of 12 colours, and Android swaps it when you leave the app.
          </Text>
        ) : null}
        {accentHue !== null ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setAccentHue(null)}
            style={({ pressed }) => [styles.reset, { borderColor: themeColors.border, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.resetText, { color: themeColors.text }]}>Use the theme's own colour</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 15, marginBottom: 25 },
  sectionTitle: { fontSize: 12, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase' },
  card: { borderWidth: 1, padding: 16, gap: 12 },
  hint: { fontSize: 12, textAlign: 'center' },
  reset: { borderWidth: 1, padding: 12, alignItems: 'center' },
  resetText: { fontSize: 14, fontWeight: '600' },
});
