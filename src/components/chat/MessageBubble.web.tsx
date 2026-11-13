import { Ionicons } from '@expo/vector-icons';
import React, { memo, useMemo } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Paper, POINTER, Text } from '../parchment';
import { ThemeColors } from '../../theme/mapTheme';
import { useSwipeToReply } from '../../hooks/useSwipeToReply';
import { withAlpha } from '../../theme/parchment';
import { Message } from '../../types';
import { formatClock } from '../../utils/conversation';
import { isHollow, MessageReceipts, Reader, showsQueue, statusIcon, StatusIconKind } from '../../utils/receipts';
import { LinkPreviewCard } from './LinkPreviewCard';
import { MessageContent } from './MessageContent';
import { ReadersQueue } from './ReadersQueue';

interface Props {
  message: Message;
  isMine: boolean;
  /** What happened to a message you sent (utils/receipts.ts). Only meaningful for your own messages. */
  receipts?: MessageReceipts;
  /** Each member's username by uid, for the letters in the avatar queue. */
  names: Record<string, string>;
  /** Show the sender's name above incoming messages (group chats). */
  showSender: boolean;
  colors: ThemeColors;
  onLongPress: (message: Message) => void;
  onReplyPress?: (messageId: string) => void;
  /** Swiping the message to the right replies to it. */
  onSwipeReply?: (message: Message) => void;
  /** Tapping a live-location message opens the map. */
  onOpenLocation?: (message: Message) => void;
  /** This is the newest message you sent: the only one that shows the avatar queue (utils/receipts.ts latestSentId). */
  latestSent?: boolean;
  /** Tapping the avatar queue opens the "Read by" list. */
  onOpenReaders?: (message: Message, readers: Reader[]) => void;
  /** Tapping the red alert of a message that was not sent. */
  onRetry?: (message: Message) => void;
}

/** A clock while sending, one tick when sent, two faint ticks when delivered. (A failed message has its alert beside the slip.) */
function StatusIcon({ kind, color }: { kind: StatusIconKind; color: string }) {
  switch (kind) {
    case 'clock':
      return <Ionicons name="time-outline" size={13} color={color} accessibilityLabel="Sending" />;
    case 'tick':
      return <Ionicons name="checkmark" size={14} color={color} accessibilityLabel="Sent" />;
    case 'ticks':
      return (
        <Ionicons name="checkmark-done" size={14} color={color} style={{ opacity: 0.65 }} accessibilityLabel="Delivered" />
      );
    case 'alert':
      return null;
  }
}

/**
 * One message, written on a slip of paper pinned to the map: theirs on fresh parchment, yours on sea-blue until they have
 * seen it (everyone, in a group), then on plain parchment framed in sea-blue ink: the map's version of the phone's
 * hollow bubble. Each slip lies at its own tiny angle, fixed by the message id, so the list looks hand-placed.
 */
function MessageBubbleBase({
  message,
  isMine,
  receipts,
  names,
  showSender,
  colors,
  onLongPress,
  onReplyPress,
  onSwipeReply,
  onOpenLocation,
  latestSent = false,
  onOpenReaders,
  onRetry,
}: Props) {
  const deleted = message.deletedForEveryone;
  const mediaOnly = !deleted && message.type === 'gif';

  const state = isMine ? receipts?.state : undefined;
  const seen = !mediaOnly && !!state && isHollow(state);
  const onBlue = isMine && !seen;
  const ownText = seen ? colors.ink : colors.buttonText;
  const ownSub = seen ? colors.inkSoft : colors.buttonText;
  const previewColors = useMemo(
    () => (isMine && seen ? { ...colors, buttonText: colors.ink } : colors),
    [isMine, seen, colors]
  );
  const textColor = isMine ? ownText : colors.ink;
  const subColor = isMine ? ownSub : colors.inkSoft;
  const failed = state === 'failed';
  const icon = state ? statusIcon(state) : null;
  const readers = receipts?.readers ?? [];

  // Swipe right to reply (a deleted message cannot be replied to).
  const canSwipe = !!onSwipeReply && !deleted && !failed;
  const swipe = useSwipeToReply(() => onSwipeReply?.(message), canSwipe);

  const content = (
    <Pressable
      onPress={failed ? () => onRetry?.(message) : undefined}
      onLongPress={() => !deleted && (failed ? onRetry?.(message) : onLongPress(message))}
      delayLongPress={250}
      style={[styles.bubble, mediaOnly && styles.bubbleMedia, POINTER]}
    >
      {showSender && !isMine && (
        <Text kind="label" style={[styles.sender, { color: colors.stamp }]} numberOfLines={1}>
          {message.senderUsername}
        </Text>
      )}

      {message.forwarded && !deleted && (
        <View style={styles.inline}>
          <Ionicons name="arrow-redo" size={12} color={subColor} />
          <Text kind="hand" style={[styles.meta, { color: subColor }]}>
            Forwarded
          </Text>
        </View>
      )}

      {message.replyTo && !deleted && (
        <Pressable
          onPress={() => onReplyPress?.(message.replyTo!.messageId)}
          style={[
            styles.reply,
            POINTER,
            {
              borderLeftColor: onBlue ? colors.buttonText : colors.stamp,
              backgroundColor: onBlue ? 'rgba(0,0,0,0.12)' : withAlpha(colors.paperAlt, 0.7),
            },
          ]}
        >
          <Text kind="label" style={[styles.replyName, { color: textColor }]} numberOfLines={1}>
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
          <Text kind="hand" style={[styles.deleted, { color: subColor }]}>
            This message was deleted
          </Text>
        </View>
      ) : (
        <MessageContent message={message} textColor={textColor} onOpenLocation={onOpenLocation} onLongPress={onLongPress} />
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
        <Text kind="hand" style={[styles.time, { color: subColor }]}>
          {formatClock(message.createdAt)}
        </Text>
        {isMine && icon && <StatusIcon kind={icon} color={ownSub} />}
      </View>
    </Pressable>
  );

  return (
    <View>
      {canSwipe && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swipeIcon,
            {
              backgroundColor: colors.paper,
              borderColor: colors.brass,
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
        {failed && (
          <Pressable
            onPress={() => onRetry?.(message)}
            hitSlop={10}
            style={[styles.failedAlert, POINTER]}
            accessibilityRole="button"
            accessibilityLabel="Message not sent. Try again"
          >
            <Ionicons name="alert-circle" size={22} color={colors.danger} />
          </Pressable>
        )}
        {mediaOnly ? (
          // A GIF is a picture, not a slip: it sits on the page without paper behind it.
          <View style={styles.slip}>{content}</View>
        ) : (
          <Paper
            tone={onBlue ? 'accent' : 'paper'}
            seed={message.id}
            maxTilt={0.5}
            lift={1}
            radius={4}
            style={styles.slip}
            contentStyle={isMine && seen ? { borderWidth: 2, borderColor: colors.accent } : undefined}
          >
            {content}
          </Paper>
        )}
      </Animated.View>
      {isMine && readers.length > 0 && (
        <ReadersQueue
          readers={readers}
          show={latestSent && !!state && showsQueue(state)}
          names={names}
          colors={colors}
          onPress={() => onOpenReaders?.(message, readers)}
        />
      )}
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleBase);

const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, marginVertical: 4, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  slip: { maxWidth: '82%' },
  failedAlert: { alignSelf: 'center', marginRight: 6 },
  // The reply arrow that appears at the left edge as the message is swiped right.
  swipeIcon: {
    position: 'absolute',
    left: 12,
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: { paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMedia: { paddingHorizontal: 0, paddingVertical: 0 },
  sender: { fontSize: 14, lineHeight: 17, letterSpacing: 0.6, marginBottom: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  meta: { fontSize: 14, lineHeight: 17 },
  reply: { borderLeftWidth: 3, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6 },
  replyName: { fontSize: 13, lineHeight: 16, letterSpacing: 0.5 },
  replyText: { fontSize: 15, lineHeight: 18 },
  deleted: { fontSize: 16, lineHeight: 20 },
  footer: { flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', gap: 4, marginTop: 2 },
  time: { fontSize: 13, lineHeight: 15, opacity: 0.85 },
});
