import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../hooks/themeContext';
import { Message } from '../../types';

export type MessageAction = 'reply' | 'copy' | 'forward' | 'deleteForMe' | 'deleteForEveryone';

interface Props {
  message: Message | null;
  isMine: boolean;
  colors: ThemeColors;
  onSelect: (action: MessageAction, message: Message) => void;
  onClose: () => void;
}

const DANGER = '#CF6679';

export function MessageActionSheet({ message, isMine, colors, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  if (!message) return null;

  const actions: { id: MessageAction; label: string; icon: keyof typeof Ionicons.glyphMap; danger?: boolean }[] = [
    { id: 'reply', label: 'Reply', icon: 'arrow-undo' },
    ...(message.type === 'text' && message.text
      ? [{ id: 'copy' as const, label: 'Copy', icon: 'copy-outline' as const }]
      : []),
    { id: 'forward', label: 'Forward', icon: 'arrow-redo' },
    { id: 'deleteForMe', label: 'Delete for me', icon: 'trash-outline', danger: true },
    ...(isMine
      ? [{ id: 'deleteForEveryone' as const, label: 'Delete for everyone', icon: 'trash' as const, danger: true }]
      : []),
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          {actions.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => onSelect(a.id, message)}
              style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.inputBg }]}
            >
              <Ionicons name={a.icon} size={20} color={a.danger ? DANGER : colors.text} />
              <Text style={[styles.label, { color: a.danger ? DANGER : colors.text }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, paddingTop: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  label: { fontSize: 16 },
});
