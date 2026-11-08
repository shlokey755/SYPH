import { Ionicons } from '@expo/vector-icons';
import React, { memo, useMemo } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../parchment';
import { ThemeColors } from '../../hooks/themeContext';
import { useSwipeToReply } from '../../hooks/useSwipeToReply';
import { Message, MessageStatus } from '../../types';
import { readBubbleColors } from '../../utils/bubbleColors';
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
  /** Swiping the message to the right replies to it. */
  onSwipeReply?: (message: Message) => void;
  /** Tapping a live-location message opens the map. */
  onOpenLocation?: (message: Message) => void;
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
  onSwipeReply,
  onOpenLocation,
}: Props) {
  // Your message keeps the theme accent until the other person has read it, then the bubble turns a little darker.
  const read = isMine && status === 'read';
  const readLook = useMemo(() => readBubbleColors(colors.accent, colors.buttonText), [colors.accent, colors.buttonText]);
  const ownText = read ? readLook.text : colors.buttonText;
  const previewColors = useMemo(
    () => (read ? { ...colors, buttonText: readLook.text } : colors),
    [read, colors, readLook.text]
  );
  const textColor = isMine ? ownText : colors.text;
  const subColor = isMine ? ownText : colors.subText;
  const deleted = message.deletedForEveryone;
  const mediaOnly = !deleted && message.type === 'gif';

  // Swipe right to reply (a deleted message cannot be replied to).
  const canSwipe = !!onSwipeReply && !deleted;
  const swipe = useSwipeToReply(() => onSwipeReply?.(message), canSwipe);

  return (
    <View>
      {canSwipe && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swipeIcon,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.border,
              opacity: swipe.progress,
              transform: [{ scale: swipe.progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
            },
          ]}
        >
          <Ionicons name="arrow-undo" size={18} color={colors.accent} />
        </Animated.View>
      )}
      <Animated.View
        {...swipe.panHandlers}
        style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs, { transform: [{ translateX: swipe.offset }] }]}
      >
        <Pressable
          onLongPress={() => !deleted && onLongPress(message)}
          delayLongPress={250}
          style={[
            styles.bubble,
            mediaOnly && styles.bubbleMedia,
            !mediaOnly &&
              (isMine
                ? { backgroundColor: read ? readLook.background : colors.accent, borderBottomRightRadius: 4 }
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
                  borderLeftColor: isMine ? ownText : colors.accent,
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
            {isMine && status && <StatusIcon status={status} color={ownText} />}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleBase);

const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, marginVertical: 3, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  // The reply arrow that appears at the left edge as the message is swiped right.
  swipeIcon: {
    position: 'absolute',
    left: 12,
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
