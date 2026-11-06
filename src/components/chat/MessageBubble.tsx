import { Ionicons } from '@expo/vector-icons';
import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../../hooks/themeContext';
import { Message, MessageStatus } from '../../types';
import { IDLE_TICK_OPACITY, ownBubbleColors } from '../../utils/bubbleColors';
import { formatClock } from '../../utils/conversation';
import { LinkPreviewCard } from './LinkPreviewCard';
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
  /** Tapping a live-location message opens the map. */
  onOpenLocation?: (message: Message) => void;
}

/**
 * One tick: sent. Two ticks: delivered to the other phone. Two blue ticks: read. A clock while it is still being sent.
 * Sent and delivered are drawn a little faint; read takes the bright "read" colour.
 */
function StatusIcon({ status, color, readColor }: { status: MessageStatus; color: string; readColor: string }) {
  switch (status) {
    case 'pending':
      return (
        <Ionicons
          name="time-outline"
          size={13}
          color={color}
          style={{ opacity: IDLE_TICK_OPACITY }}
          accessibilityLabel="Sending"
        />
      );
    case 'sent':
      return (
        <Ionicons
          name="checkmark"
          size={15}
          color={color}
          style={{ opacity: IDLE_TICK_OPACITY }}
          accessibilityLabel="Sent"
        />
      );
    case 'delivered':
      return (
        <Ionicons
          name="checkmark-done"
          size={15}
          color={color}
          style={{ opacity: IDLE_TICK_OPACITY }}
          accessibilityLabel="Delivered"
        />
      );
    case 'read':
      return <Ionicons name="checkmark-done" size={15} color={readColor} accessibilityLabel="Read" />;
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
  onOpenLocation,
}: Props) {
  // Your own messages: the theme accent a little darker, with text that still reads on it.
  const own = useMemo(() => ownBubbleColors(colors.accent, colors.buttonText), [colors.accent, colors.buttonText]);
  const previewColors = useMemo(
    () => (isMine ? { ...colors, buttonText: own.text } : colors),
    [isMine, colors, own.text]
  );
  const textColor = isMine ? own.text : colors.text;
  const subColor = isMine ? own.text : colors.subText;
  const deleted = message.deletedForEveryone;
  const mediaOnly = !deleted && message.type === 'gif';

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
              ? { backgroundColor: own.background, borderBottomRightRadius: 4 }
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
                borderLeftColor: isMine ? own.text : colors.accent,
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
            onOpenLocation={onOpenLocation}
            onLongPress={onLongPress}
          />
        )}

        {!deleted && message.type === 'text' && (
          <LinkPreviewCard
            text={message.text}
            isMine={isMine}
            colors={previewColors}
            onLongPress={() => onLongPress(message)}
          />
        )}

        <View style={styles.footer}>
          <Text style={[styles.time, { color: subColor }]}>{formatClock(message.createdAt)}</Text>
          {isMine && status && <StatusIcon status={status} color={own.text} readColor={own.readTick} />}
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
