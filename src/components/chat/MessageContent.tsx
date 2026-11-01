/**
 * MessageContent.tsx
 * Renders the body of a message by type: text, GIF or live location. Old photo / video / voice / document messages
 * (from before file sharing was removed) show a one-line label instead of the file. Old sticker messages are just an
 * emoji, so they show as ordinary text.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Message, MessageMedia } from '../../types';
import { isLegacyMediaType, legacyMediaLabel } from '../../utils/messageType';
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
          style={{ width: MEDIA_WIDTH, height: gifHeight(media), borderRadius: 12 }}
          contentFit="cover"
          transition={150}
        />
      );

    default:
      return <Text style={[styles.text, { color: textColor }]}>{message.text}</Text>;
  }
}

const styles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 20 },
  legacy: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legacyText: { fontStyle: 'italic', opacity: 0.8 },
});
