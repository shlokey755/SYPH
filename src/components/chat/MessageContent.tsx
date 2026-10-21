/**
 * MessageContent.tsx
 * Renders the body of a message by type: text, sticker, GIF. Old photo / video / voice / document messages (from
 * before file sharing was removed) show a one-line label instead of the file.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Message, MessageMedia } from '../../types';
import { isLegacyMediaType, legacyMediaLabel } from '../../utils/messageType';

interface Props {
  message: Message;
  textColor: string;
}

const MEDIA_WIDTH = 230;

function gifHeight(media: MessageMedia | undefined) {
  const ratio = media?.width && media?.height ? media.width / media.height : 1;
  return Math.max(80, Math.min(320, MEDIA_WIDTH / ratio));
}

export function MessageContent({ message, textColor }: Props) {
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
    case 'sticker':
      return <Text style={styles.sticker}>{message.text}</Text>;

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
  sticker: { fontSize: 64, lineHeight: 76 },
  legacy: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legacyText: { fontStyle: 'italic', opacity: 0.8 },
});
