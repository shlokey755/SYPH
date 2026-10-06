/**
 * MediaViewer.tsx
 * Full-screen viewer for photos, GIFs and videos.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Message } from '../../types';

interface Props {
  message: Message | null;
  onClose: () => void;
}

function VideoPane({ url }: { url: string }) {
  const player = useVideoPlayer({ uri: url }, (p) => {
    p.play();
  });
  return <VideoView player={player} style={styles.media} nativeControls contentFit="contain" />;
}

export function MediaViewer({ message, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const url = message?.media?.url;
  if (!message || !url) return null;

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        {message.type === 'video' ? (
          <VideoPane url={url} />
        ) : (
          <Image source={{ uri: url }} style={styles.media} contentFit="contain" />
        )}
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityLabel="Close"
          style={[styles.close, { top: insets.top + 12 }]}
        >
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', justifyContent: 'center' },
  media: { width: '100%', height: '100%' },
  close: { position: 'absolute', right: 16, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 6 },
});
