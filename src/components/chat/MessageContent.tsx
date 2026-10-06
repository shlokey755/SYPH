/**
 * MessageContent.tsx
 * Renders the body of a message by type: text, image, GIF, video, voice note, document, sticker.
 */

import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../../hooks/themeContext';
import { formatBytes, formatDuration } from '../../services/mediaService';
import { Message, MessageMedia } from '../../types';

interface Props {
  message: Message;
  textColor: string;
  colors: ThemeColors;
  isMine: boolean;
  onOpenMedia?: (message: Message) => void;
}

const MEDIA_WIDTH = 230;

function mediaHeight(media: MessageMedia | undefined, fallbackRatio = 1) {
  const ratio = media?.width && media?.height ? media.width / media.height : fallbackRatio;
  return Math.max(80, Math.min(320, MEDIA_WIDTH / ratio));
}

function AudioMessage({ media, color, accent }: { media: MessageMedia; color: string; accent: string }) {
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const [loaded, setLoaded] = useState(false);

  const totalSeconds = status.duration || (media.durationMs ?? 0) / 1000;
  const progress = totalSeconds > 0 ? Math.min(1, status.currentTime / totalSeconds) : 0;

  const toggle = () => {
    if (!loaded) {
      player.replace({ uri: media.url });
      setLoaded(true);
      player.play();
      return;
    }
    if (status.playing) {
      player.pause();
      return;
    }
    if (totalSeconds > 0 && status.currentTime >= totalSeconds - 0.05) player.seekTo(0);
    player.play();
  };

  return (
    <View style={styles.audio}>
      <Pressable onPress={toggle} hitSlop={8} accessibilityLabel={status.playing ? 'Pause' : 'Play voice message'}>
        <Ionicons name={status.playing ? 'pause-circle' : 'play-circle'} size={36} color={color} />
      </Pressable>
      <View style={styles.audioBody}>
        <View style={styles.trackWrap}>
          <View style={[styles.track, { backgroundColor: color, opacity: 0.25 }]} />
          <View style={[styles.trackFill, { backgroundColor: accent, width: `${progress * 100}%` }]} />
        </View>
        <Text style={[styles.audioTime, { color }]}>
          {formatDuration(status.playing || progress > 0 ? status.currentTime * 1000 : media.durationMs)}
        </Text>
      </View>
    </View>
  );
}

export function MessageContent({ message, textColor, colors, isMine, onOpenMedia }: Props) {
  const { media } = message;

  switch (message.type) {
    case 'text':
      return <Text style={[styles.text, { color: textColor }]}>{message.text}</Text>;

    case 'sticker':
      return <Text style={styles.sticker}>{message.text}</Text>;

    case 'image':
    case 'gif':
      if (!media) return null;
      return (
        <Pressable onPress={() => onOpenMedia?.(message)}>
          <Image
            source={{ uri: media.url }}
            style={{ width: MEDIA_WIDTH, height: mediaHeight(media), borderRadius: 12 }}
            contentFit="cover"
            transition={150}
          />
        </Pressable>
      );

    case 'video':
      if (!media) return null;
      return (
        <Pressable
          onPress={() => onOpenMedia?.(message)}
          style={[styles.video, { width: MEDIA_WIDTH, height: mediaHeight(media, 16 / 9) }]}
          accessibilityLabel="Play video"
        >
          <Ionicons name="play-circle" size={52} color="#FFFFFF" />
          {media.durationMs ? <Text style={styles.videoTime}>{formatDuration(media.durationMs)}</Text> : null}
        </Pressable>
      );

    case 'audio':
      if (!media) return null;
      return <AudioMessage media={media} color={textColor} accent={isMine ? colors.buttonText : colors.accent} />;

    case 'document':
      if (!media) return null;
      return (
        <Pressable onPress={() => Linking.openURL(media.url)} style={styles.document}>
          <Ionicons name="document-text" size={30} color={textColor} />
          <View style={styles.documentBody}>
            <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
              {media.name ?? 'Document'}
            </Text>
            <Text style={[styles.meta, { color: textColor }]}>{formatBytes(media.size)}</Text>
          </View>
        </Pressable>
      );

    default:
      return <Text style={[styles.text, { color: textColor }]}>{message.text}</Text>;
  }
}

const styles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 20 },
  sticker: { fontSize: 64, lineHeight: 76 },
  video: { backgroundColor: '#111111', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  videoTime: { position: 'absolute', right: 8, bottom: 6, color: '#FFFFFF', fontSize: 12 },
  audio: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 190 },
  audioBody: { flex: 1, justifyContent: 'center' },
  trackWrap: { height: 4, justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 2 },
  trackFill: { height: 4, borderRadius: 2 },
  audioTime: { fontSize: 11, marginTop: 6, opacity: 0.8 },
  document: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 190 },
  documentBody: { flex: 1 },
  meta: { fontSize: 11, opacity: 0.7 },
});
