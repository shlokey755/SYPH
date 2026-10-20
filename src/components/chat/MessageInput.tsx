import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../hooks/themeContext';
import { ReplyPreview } from '../../types';

interface Props {
  colors: ThemeColors;
  replyTo: ReplyPreview | null;
  onCancelReply: () => void;
  onSend: (text: string) => void;
  onOpenSticker: () => void;
  onOpenGif: () => void;
}

export function MessageInput({ colors, replyTo, onCancelReply, onSend, onOpenSticker, onOpenGif }: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setText('');
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.cardBackground,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      {replyTo && (
        <View style={[styles.replyBar, { backgroundColor: colors.inputBg, borderLeftColor: colors.accent }]}>
          <View style={styles.replyBody}>
            <Text style={[styles.replyName, { color: colors.accent }]} numberOfLines={1}>
              Replying to {replyTo.senderUsername}
            </Text>
            <Text style={[styles.replyText, { color: colors.subText }]} numberOfLines={1}>
              {replyTo.text}
            </Text>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={10}>
            <Ionicons name="close" size={20} color={colors.subText} />
          </Pressable>
        </View>
      )}

      <View style={styles.row}>
        <Pressable onPress={onOpenSticker} hitSlop={8} style={styles.iconButton} accessibilityLabel="Stickers">
          <Ionicons name="happy-outline" size={28} color={colors.accent} />
        </Pressable>
        <Pressable onPress={onOpenGif} hitSlop={8} style={styles.iconButton} accessibilityLabel="GIFs">
          <View style={[styles.gifBadge, { borderColor: colors.accent }]}>
            <Text style={[styles.gifText, { color: colors.accent }]}>GIF</Text>
          </View>
        </Pressable>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
          placeholder="Message"
          placeholderTextColor={colors.subText}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={4000}
        />
        <Pressable
          onPress={submit}
          disabled={!canSend}
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend }}
          style={[styles.send, { backgroundColor: colors.accent }, !canSend && styles.sendIdle]}
        >
          <Ionicons name="send" size={18} color={colors.buttonText} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: 1, paddingHorizontal: 10, paddingTop: 8, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  iconButton: { height: 42, justifyContent: 'center' },
  gifBadge: { borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  gifText: { fontSize: 12, fontWeight: '800' },
  input: { flex: 1, maxHeight: 120, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15 },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sendIdle: { opacity: 0.4 },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderLeftWidth: 3, borderRadius: 6, padding: 8 },
  replyBody: { flex: 1 },
  replyName: { fontSize: 12, fontWeight: '700' },
  replyText: { fontSize: 12 },
});
