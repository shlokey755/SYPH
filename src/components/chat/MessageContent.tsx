/**
 * MessageContent.tsx
 * Renders the body of a message by type. Text is handled here; media types are added with the
 * media feature and fall back to a labelled placeholder until then.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../../hooks/themeContext';
import { messagePreview } from '../../services/chatService';
import { Message } from '../../types';

interface Props {
  message: Message;
  textColor: string;
  colors: ThemeColors;
  isMine: boolean;
}

export function MessageContent({ message, textColor }: Props) {
  if (message.type === 'text') {
    return <Text style={[styles.text, { color: textColor }]}>{message.text}</Text>;
  }

  // Placeholder for media types until the media renderers are wired in.
  return (
    <View style={styles.placeholder}>
      <Ionicons name="attach" size={16} color={textColor} />
      <Text style={[styles.text, { color: textColor }]}>
        {message.text || messagePreview(message.type)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 20 },
  placeholder: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
