import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { NativeSyntheticEvent, Pressable, StyleSheet, TextInputKeyPressEventData, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../hooks/themeContext';
import { ReplyPreview } from '../../types';
import { Field, IS_WEB, POINTER, RoundButton, roundLook, Text } from '../parchment';

interface Props {
  colors: ThemeColors;
  replyTo: ReplyPreview | null;
  onCancelReply: () => void;
  onSend: (text: string) => void;
  /** Called with the new text on every edit (drives the "typing…" indicator). */
  onTextChange?: (text: string) => void;
  /** Holding the send button opens the "Share location" popup. */
  onOpenLocation: () => void;
  onOpenGif: () => void;
}

export function MessageInput({
  colors,
  replyTo,
  onCancelReply,
  onSend,
  onTextChange,
  onOpenLocation,
  onOpenGif,
}: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setText('');
  };

  // In a browser, Enter sends and Shift+Enter starts a new line, as in every web chat. A phone's keyboard is unchanged.
  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key !== 'Enter' || (e.nativeEvent as { shiftKey?: boolean }).shiftKey) return;
    e.preventDefault();
    submit();
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.paper, borderTopColor: colors.brass, paddingBottom: Math.max(insets.bottom, 8) },
      ]}
    >
      {replyTo && (
        <View style={[styles.replyBar, { backgroundColor: colors.paperAlt, borderLeftColor: colors.accent }]}>
          <View style={styles.replyBody}>
            <Text kind="label" style={[styles.replyName, { color: colors.accent }]} numberOfLines={1}>
              Replying to {replyTo.senderUsername}
            </Text>
            <Text style={[styles.replyText, { color: colors.inkSoft }]} numberOfLines={1}>
              {replyTo.text}
            </Text>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={10} style={POINTER} accessibilityLabel="Cancel reply">
            <Ionicons name="close" size={20} color={colors.inkSoft} />
          </Pressable>
        </View>
      )}

      <View style={styles.row}>
        <Pressable onPress={onOpenGif} hitSlop={8} style={[styles.iconButton, POINTER]} accessibilityLabel="GIFs">
          <View style={[styles.gifBadge, { borderColor: colors.accent }]}>
            <Text kind="label" style={[styles.gifText, { color: colors.accent }]}>
              GIF
            </Text>
          </View>
        </Pressable>
        <Field
          boxStyle={styles.fieldBox}
          style={styles.input}
          placeholder="Message"
          value={text}
          onChangeText={(value) => {
            setText(value);
            onTextChange?.(value);
          }}
          onKeyPress={IS_WEB ? onKeyPress : undefined}
          multiline
          maxLength={4000}
        />
        {/* Stays pressable when the box is empty: a disabled button ignores a long press. */}
        <RoundButton
          tone="sea"
          size={46}
          onPress={submit}
          onLongPress={onOpenLocation}
          delayLongPress={350}
          accessibilityLabel="Send message"
          accessibilityHint="Hold to share your location"
          dimmed={!canSend}
        >
          <Ionicons name="send" size={18} color={roundLook(colors, 'sea').ink} />
        </RoundButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: 3, paddingHorizontal: 10, paddingTop: 8, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  iconButton: { height: 46, justifyContent: 'center' },
  gifBadge: { borderWidth: 1.5, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  gifText: { fontSize: 15, lineHeight: 17, letterSpacing: 1 },
  fieldBox: { flex: 1 },
  input: { maxHeight: 120, paddingVertical: 9 },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderLeftWidth: 3, borderRadius: 4, padding: 8 },
  replyBody: { flex: 1 },
  replyName: { fontSize: 14, lineHeight: 17, letterSpacing: 0.6 },
  replyText: { fontSize: 15, lineHeight: 18 },
});
