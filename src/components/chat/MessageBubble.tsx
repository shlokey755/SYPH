import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../../hooks/themeContext';
import { Message, MessageStatus } from '../../types';
import { formatClock } from '../../utils/conversation';
import { MessageContent } from './MessageContent';

interface Props {
  message: Message;
  isMine: boolean;
  /** Only meaningful for your own messages. */
  status?: MessageStatus;
  /** Show the sender's name above incoming messages (group chats). */
  showSender: boolean;
  colors: ThemeColors;
  onLongPress: (message: Message) => void;
  onReplyPress?: (messageId: string) => void;
  onOpenMedia?: (message: Message) => void;
}

function StatusIcon({ status, color }: { status: MessageStatus; color: string }) {
  switch (status) {
    case 'pending':
      return <Ionicons name="time-outline" size={13} color={color} accessibilityLabel="Sending" />;
    case 'sent':
      return <Ionicons name="checkmark" size={14} color={color} accessibilityLabel="Sent" />;
    case 'delivered':
      return (
        <Ionicons name="checkmark-done" size={14} color={color} style={{ opacity: 0.65 }} accessibilityLabel="Delivered" />
      );
    case 'read':
      return <Ionicons name="checkmark-done" size={14} color={color} accessibilityLabel="Read" />;
  }
}

function MessageBubbleBase({
  message,
  isMine,
  status,
  showSender,
  colors,
  onLongPress,
  onReplyPress,
  onOpenMedia,
}: Props) {
  const textColor = isMine ? colors.buttonText : colors.text;
  const subColor = isMine ? colors.buttonText : colors.subText;
  const deleted = message.deletedForEveryone;
  const mediaOnly = !deleted && (message.type === 'sticker' || message.type === 'gif');

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <Pressable
        onLongPress={() => !deleted && onLongPress(message)}
        delayLongPress={250}
        style={[
          styles.bubble,
          mediaOnly && styles.bubbleMedia,
          !mediaOnly &&
            (isMine
              ? { backgroundColor: colors.accent, borderBottomRightRadius: 4 }
              : {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderBottomLeftRadius: 4,
                }),
        ]}
      >
        {showSender && !isMine && (
          <Text style={[styles.sender, { color: colors.accent }]} numberOfLines={1}>
            {message.senderUsername}
          </Text>
        )}

        {message.forwarded && !deleted && (
          <View style={styles.inline}>
            <Ionicons name="arrow-redo" size={12} color={subColor} />
            <Text style={[styles.meta, { color: subColor }]}>Forwarded</Text>
          </View>
        )}

        {message.replyTo && !deleted && (
          <Pressable
            onPress={() => onReplyPress?.(message.replyTo!.messageId)}
            style={[
              styles.reply,
              {
                borderLeftColor: isMine ? colors.buttonText : colors.accent,
                backgroundColor: isMine ? 'rgba(0,0,0,0.12)' : colors.inputBg,
              },
            ]}
          >
            <Text style={[styles.replyName, { color: textColor }]} numberOfLines={1}>
              {message.replyTo.senderUsername}
            </Text>
            <Text style={[styles.replyText, { color: subColor }]} numberOfLines={2}>
              {message.replyTo.text}
            </Text>
          </Pressable>
        )}

        {deleted ? (
          <View style={styles.inline}>
            <Ionicons name="ban-outline" size={14} color={subColor} />
            <Text style={[styles.deleted, { color: subColor }]}>This message was deleted</Text>
          </View>
        ) : (
          <MessageContent
            message={message}
            textColor={textColor}
            colors={colors}
            isMine={isMine}
            onOpenMedia={onOpenMedia}
          />
        )}

        <View style={styles.footer}>
          <Text style={[styles.time, { color: subColor }]}>{formatClock(message.createdAt)}</Text>
          {isMine && status && <StatusIcon status={status} color={colors.buttonText} />}
        </View>
      </Pressable>
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleBase);

const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, marginVertical: 3, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  bubbleMedia: { backgroundColor: 'transparent', paddingHorizontal: 0 },
  sender: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  meta: { fontSize: 11, fontStyle: 'italic' },
  reply: { borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6 },
  replyName: { fontSize: 12, fontWeight: '700' },
  replyText: { fontSize: 12 },
  deleted: { fontSize: 14, fontStyle: 'italic' },
  footer: { flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', gap: 4, marginTop: 2 },
  time: { fontSize: 10, opacity: 0.8 },
});
