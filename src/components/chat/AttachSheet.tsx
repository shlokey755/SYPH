import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../hooks/themeContext';

export type AttachChoice = 'library' | 'camera' | 'document' | 'gif' | 'sticker';

interface Props {
  visible: boolean;
  colors: ThemeColors;
  onChoose: (choice: AttachChoice) => void;
  onClose: () => void;
}

const OPTIONS: { id: AttachChoice; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'library', label: 'Photo & video', icon: 'images' },
  { id: 'camera', label: 'Camera', icon: 'camera' },
  { id: 'document', label: 'Document', icon: 'document-text' },
  { id: 'gif', label: 'GIF', icon: 'happy' },
  { id: 'sticker', label: 'Sticker', icon: 'sparkles' },
];

export function AttachSheet({ visible, colors, onChoose, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.cardBackground, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.grid}>
            {OPTIONS.map((o) => (
              <Pressable key={o.id} style={styles.option} onPress={() => onChoose(o.id)}>
                <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
                  <Ionicons name={o.icon} size={24} color={colors.buttonText} />
                </View>
                <Text style={[styles.label, { color: colors.text }]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, padding: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'flex-start' },
  option: { width: 78, alignItems: 'center', gap: 8 },
  iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, textAlign: 'center' },
});
