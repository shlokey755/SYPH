/**
 * VideoPlayerModal.tsx
 * The pop-up that plays a YouTube video or Short without leaving SYPH: YouTube's own embedded player inside a WebView
 * (free, no key). Close it with the X, a tap outside, or the back button; closing removes the player, so sound stops.
 * If the video cannot play here (embedding turned off by its owner, no connection) the pop-up says why and offers
 * "Open in YouTube". Mounted only while open, so no WebView exists the rest of the time.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ThemeColors } from '../../hooks/themeContext';
import {
  buildPlayerHtml,
  isPlayerPage,
  isYouTubeUrl,
  parsePlayerMessage,
  PLAYER_ORIGIN,
  PLAYER_TIMEOUT_TEXT,
  playerErrorText,
  playerSize,
} from '../../utils/youtubePlayer';
import { YouTubeLink } from '../../utils/linkPreview';
import { loadWebView } from './loadWebView';

interface Props {
  link: YouTubeLink;
  title?: string;
  colors: ThemeColors;
  onClose: () => void;
}

/** How long to wait for the player to report ready before saying so. */
const READY_TIMEOUT_MS = 15_000;

export function VideoPlayerModal({ link, title, colors, onClose }: Props) {
  const WebView = useMemo(loadWebView, []);
  const html = useMemo(() => buildPlayerHtml(link.id), [link.id]);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const size = playerSize(link.kind === 'short', windowWidth, windowHeight);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(html && WebView ? 'loading' : 'failed');
  const [failure, setFailure] = useState(html && WebView ? '' : 'The player is not available in this build.');

  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => {
      setFailure(PLAYER_TIMEOUT_TEXT);
      setStatus('failed');
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const openInYouTube = () => {
    Linking.openURL(link.openUrl).catch(() => {});
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close player">
        {/* The dialog swallows taps, so only the dark area around it closes the player. */}
        <Pressable
          onPress={() => {}}
          style={[styles.dialog, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
        >
          <View style={[styles.header, { width: size.width }]}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {title || (link.kind === 'short' ? 'YouTube Short' : 'YouTube video')}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close player">
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <View style={[styles.screen, { width: size.width, height: size.height }]}>
            {WebView && html && (
              <WebView
                source={{ html, baseUrl: PLAYER_ORIGIN }}
                style={styles.web}
                originWhitelist={['*']}
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                allowsFullscreenVideo={false}
                setSupportMultipleWindows={false}
                onMessage={(event) => {
                  const message = parsePlayerMessage(event.nativeEvent.data);
                  if (!message) return;
                  if (message.type === 'ready') {
                    setStatus('ready');
                  } else {
                    setFailure(playerErrorText(message.code));
                    setStatus('failed');
                  }
                }}
                onShouldStartLoadWithRequest={(request) => {
                  // YouTube's own frames may load; the player page may not be navigated away from.
                  if (request.isTopFrame === false || isPlayerPage(request.url)) return true;
                  if (isYouTubeUrl(request.url)) Linking.openURL(request.url).catch(() => {});
                  return false;
                }}
              />
            )}

            {status === 'loading' && (
              <View style={styles.overlay} pointerEvents="none">
                <ActivityIndicator color="#FFFFFF" />
              </View>
            )}
            {status === 'failed' && (
              <View style={styles.overlay}>
                <Ionicons name="alert-circle-outline" size={30} color="#FFFFFF" />
                <Text style={styles.failure}>{failure}</Text>
              </View>
            )}
          </View>

          <Pressable
            onPress={openInYouTube}
            accessibilityRole="link"
            accessibilityLabel="Open in YouTube"
            style={[styles.openButton, { borderColor: colors.border, width: size.width }]}
          >
            <Ionicons name="logo-youtube" size={18} color="#FF0000" />
            <Text style={[styles.openText, { color: colors.text }]}>Open in YouTube</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  dialog: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10, alignItems: 'center', maxWidth: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '600' },
  screen: { backgroundColor: '#000000', borderRadius: 10, overflow: 'hidden' },
  web: { flex: 1, backgroundColor: '#000000' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  failure: { color: '#FFFFFF', fontSize: 13, textAlign: 'center' },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  openText: { fontSize: 14, fontWeight: '600' },
});
