/**
 * MessageContent.tsx
 * Renders the body of a message by type: text (emoji-only text is animated), GIF or live location. Old photo / video / voice / document messages
 * (from before file sharing was removed) show a one-line label instead of the file. Old sticker messages are just an
 * emoji, so they show as ordinary text.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../parchment';
import { Message, MessageMedia } from '../../types';
import { emojiOnly } from '../../utils/emoji';
import { isLegacyMediaType, legacyMediaLabel } from '../../utils/messageType';
import { AnimatedEmoji } from './AnimatedEmoji';
import { LocationBubble } from './LocationBubble';

interface Props {
  message: Message;
  textColor: string;
  onOpenLocation?: (message: Message) => void;
  onLongPress?: (message: Message) => void;
}

const MEDIA_WIDTH = 230;

function gifHeight(media: MessageMedia | undefined) {
  const ratio = media?.width && media?.height ? media.width / media.height : 1;
  return Math.max(80, Math.min(320, MEDIA_WIDTH / ratio));
}

export function MessageContent({ message, textColor, onOpenLocation, onLongPress }: Props) {
  const { media, type } = message;
  // A message of nothing but emoji (up to eight) is shown big and animated.
  const emojis = useMemo(() => emojiOnly(message.text), [message.text]);

  if (isLegacyMediaType(type)) {
    return (
      <View style={styles.legacy}>
        <Ionicons name="alert-circle-outline" size={16} color={textColor} />
        <Text style={[styles.text, styles.legacyText, { color: textColor }]}>{legacyMediaLabel(type)}</Text>
      </View>
    );
  }

  switch (type) {
    case 'location':
      return <LocationBubble message={message} textColor={textColor} onOpen={onOpenLocation} onLongPress={onLongPress} />;

    case 'gif':
      if (!media) return null;
      return (
        <Image
          source={{ uri: media.url }}
          style={{ width: MEDIA_WIDTH, height: gifHeight(media) }}
          contentFit="cover"
          transition={150}
        />
      );

    default:
      if (emojis) return <AnimatedEmoji emojis={emojis} onLongPress={() => onLongPress?.(message)} />;
      return <Text style={[styles.text, { color: textColor }]}>{message.text}</Text>;
  }
}

const styles = StyleSheet.create({
  text: { fontSize: 18, lineHeight: 23 },
  legacy: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legacyText: { fontStyle: 'italic', opacity: 0.8 },
});
