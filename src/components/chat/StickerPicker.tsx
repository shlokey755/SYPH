import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../hooks/themeContext';

/** Built-in sticker pack: large emoji, no downloads or API keys needed. */
export const STICKERS = [
  '😀', '😂', '🥹', '😍', '😎', '🤩', '🥳', '😭', '😡', '🤯', '😴', '🤔',
  '🙄', '😇', '🤗', '🫡', '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👋',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '🔥', '✨', '🎉', '🎂',
  '🐶', '🐱', '🦊', '🐼', '🐸', '🦄', '🌈', '☀️', '🌙', '⭐', '🍕', '🍔',
  '🍟', '🍿', '☕', '🍺', '⚽', '🎮', '🎵', '🚀', '💯', '✅', '❌', '👀',
];

interface Props {
  visible: boolean;
  colors: ThemeColors;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

export function StickerPicker({ visible, colors, onPick, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: colors.cardBackground, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.subText }]}>Stickers</Text>
          <FlatList
            data={STICKERS}
            keyExtractor={(s) => s}
            numColumns={6}
            renderItem={({ item }) => (
              <Pressable style={styles.cell} onPress={() => onPick(item)} accessibilityLabel={`Send sticker ${item}`}>
                <Text style={styles.emoji}>{item}</Text>
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '55%', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, paddingHorizontal: 8, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  title: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginLeft: 8, marginBottom: 4 },
  cell: { flex: 1 / 6, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 32 },
});
