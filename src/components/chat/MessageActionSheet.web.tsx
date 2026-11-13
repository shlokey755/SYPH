import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { IS_WEB, Paper, POINTER, SHEET_FRAME, Text } from '../parchment';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../theme/mapTheme';
import { Message } from '../../types';
import { isLegacyMediaType } from '../../utils/messageType';

export type MessageAction = 'reply' | 'copy' | 'forward' | 'deleteForMe' | 'deleteForEveryone';

interface Props {
  message: Message | null;
  isMine: boolean;
  colors: ThemeColors;
  onSelect: (action: MessageAction, message: Message) => void;
  onClose: () => void;
}

export function MessageActionSheet({ message, isMine, colors, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  if (!message) return null;

  const actions: { id: MessageAction; label: string; icon: keyof typeof Ionicons.glyphMap; danger?: boolean }[] = [
    { id: 'reply', label: 'Reply', icon: 'arrow-undo' },
    ...(message.type === 'text' && message.text
      ? [{ id: 'copy' as const, label: 'Copy', icon: 'copy-outline' as const }]
      : []),
    // An old photo / voice note / document has no file behind it any more, and a live location belongs to the person
    // sharing it, so there is nothing to forward.
    ...(isLegacyMediaType(message.type) || message.type === 'location'
      ? []
      : [{ id: 'forward' as const, label: 'Forward', icon: 'arrow-redo' as const }]),
    { id: 'deleteForMe', label: 'Delete for me', icon: 'trash-outline', danger: true },
    ...(isMine
      ? [{ id: 'deleteForEveryone' as const, label: 'Delete for everyone', icon: 'trash' as const, danger: true }]
      : []),
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* A torn strip of map slid up from the bottom; in a browser it is a note laid in the middle of the window. */}
        <Paper torn={IS_WEB ? 'both' : 'top'} style={IS_WEB ? { ...SHEET_FRAME, maxWidth: 380, marginVertical: 30 } : null} contentStyle={{ paddingTop: 2, paddingBottom: Math.max(insets.bottom, 12) }}>
          {actions.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => onSelect(a.id, message)}
              style={({ pressed }) => [styles.item, POINTER, pressed && { backgroundColor: colors.paperAlt }]}
            >
              <Ionicons name={a.icon} size={22} color={a.danger ? colors.danger : colors.ink} />
              <Text style={[styles.label, { color: a.danger ? colors.danger : colors.ink }]}>{a.label}</Text>
            </Pressable>
          ))}
        </Paper>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(51,38,27,0.55)', justifyContent: IS_WEB ? 'center' : 'flex-end' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  label: { fontSize: 20, lineHeight: 24 },
});
