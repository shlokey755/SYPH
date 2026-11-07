import { Ionicons } from '@expo/vector-icons';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../../hooks/themeContext';
import { useSwipeToReply } from '../../hooks/useSwipeToReply';
import { Message } from '../../types';
import { withAlpha } from '../../utils/color';
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

/** A clock while sending, one tick when sent, two faint ticks when delivered. (A failed message has its alert beside the bubble.) */
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

  // Your message is a filled bubble in the theme accent until the other person has seen it (everyone, in a group); then
  // it turns hollow: the fill fades out over a quarter of a second and the 2 px accent outline stays. The text colours
  // switch halfway through the fade, so the text is never unreadable. A message that is already hollow when it appears
  // is simply drawn hollow.
  const state = isMine ? receipts?.state : undefined;
  const hollowTarget = !mediaOnly && !!state && isHollow(state);
  const fill = useRef(new Animated.Value(hollowTarget ? 1 : 0)).current;
  const [hollowLook, setHollowLook] = useState(hollowTarget);
  const lastTarget = useRef(hollowTarget);
  useEffect(() => {
    if (hollowTarget === lastTarget.current) return;
    lastTarget.current = hollowTarget;
    Animated.timing(fill, { toValue: hollowTarget ? 1 : 0, duration: 250, useNativeDriver: false }).start();
    const timer = setTimeout(() => setHollowLook(hollowTarget), 125);
    return () => clearTimeout(timer);
  }, [hollowTarget, fill]);
  const fillColor = useMemo(
    () => fill.interpolate({ inputRange: [0, 1], outputRange: [colors.accent, withAlpha(colors.accent, 0)] }),
    [fill, colors.accent]
  );

  const ownText = hollowLook ? colors.text : colors.buttonText;
  const ownSub = hollowLook ? colors.subText : colors.buttonText;
  const previewColors = useMemo(
    () => (isMine && hollowLook ? { ...colors, buttonText: colors.text } : colors),
    [isMine, hollowLook, colors]
  );
  const textColor = isMine ? ownText : colors.text;
  const subColor = isMine ? ownSub : colors.subText;
  const failed = state === 'failed';
  const icon = state ? statusIcon(state) : null;
  const readers = receipts?.readers ?? [];

  // Swipe right to reply (a deleted message cannot be replied to).
  const canSwipe = !!onSwipeReply && !deleted && !failed;
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
        {failed && (
          <Pressable
            onPress={() => onRetry?.(message)}
            hitSlop={10}
            style={styles.failedAlert}
            accessibilityRole="button"
            accessibilityLabel="Message not sent. Try again"
          >
            <Ionicons name="alert-circle" size={22} color={colors.danger} />
          </Pressable>
        )}
        <Pressable
          onPress={failed ? () => onRetry?.(message) : undefined}
          onLongPress={() => !deleted && (failed ? onRetry?.(message) : onLongPress(message))}
          delayLongPress={250}
          style={[
            styles.bubble,
            mediaOnly && styles.bubbleMedia,
            !mediaOnly &&
              (isMine
                ? [styles.bubbleMine, { borderColor: colors.accent }]
                : {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderBottomLeftRadius: 4,
                  }),
          ]}
        >
          {isMine && !mediaOnly && (
            <Animated.View pointerEvents="none" style={[styles.fill, { backgroundColor: fillColor }]} />
          )}
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
                  borderLeftColor: isMine && !hollowLook ? colors.buttonText : colors.accent,
                  backgroundColor: isMine && !hollowLook ? 'rgba(0,0,0,0.12)' : colors.inputBg,
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
            {isMine && icon && <StatusIcon kind={icon} color={ownSub} />}
          </View>
        </Pressable>
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
  // Your own bubble: a 2 px outline in the accent (so the fill can fade out and leave it) with 2 px less padding to match.
  bubbleMine: { borderWidth: 2, paddingHorizontal: 10, paddingVertical: 6, borderBottomRightRadius: 4, backgroundColor: 'transparent' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14, borderBottomRightRadius: 2 },
  failedAlert: { alignSelf: 'center', marginRight: 6 },
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
