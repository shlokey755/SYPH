/**
 * LocationViewer.tsx
 * Full-screen map for one live location message. Follows the sharer's document in real time and moves the dot on an
 * OpenStreetMap map (a Leaflet page in a WebView: free, no API key). Works for the sharer too, who also gets Stop.
 * If the map cannot load (no internet, WebView missing) the status and "Open in Maps" still work.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../hooks/themeContext';
import { LiveLocation, subscribeLiveLocation } from '../../services/locationService';
import { Message } from '../../types';
import { describeShare, isValidCoords, mapsUrl } from '../../utils/location';
import { MAP_BASE_URL, buildMapHtml, setPositionScript } from '../../utils/mapHtml';

interface Props {
  conversationId: string;
  /** The location message being viewed; the viewer is closed when this is null. */
  message: Message | null;
  sharerName: string;
  isMine: boolean;
  colors: ThemeColors;
  onStop: (message: Message) => void;
  onClose: () => void;
}

type WebViewModule = typeof import('react-native-webview');

/** Loaded on demand: the web build has no WebView, and a build without the native module should not crash. */
function loadWebView(): WebViewModule['WebView'] | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('react-native-webview') as WebViewModule).WebView;
  } catch {
    return null;
  }
}

const STATUS_TICK_MS = 15_000;

export function LocationViewer(props: Props) {
  // Mounting only while a message is open keeps the listener and the WebView from existing the rest of the time.
  if (!props.message) return null;
  return <Viewer {...props} message={props.message} />;
}

function Viewer({ conversationId, message, sharerName, isMine, colors, onStop, onClose }: Props & { message: Message }) {
  const insets = useSafeAreaInsets();
  const webRef = useRef<{ injectJavaScript: (script: string) => void } | null>(null);
  const WebView = useMemo(loadWebView, []);

  const [location, setLocation] = useState<LiveLocation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // The page is built once from the first position; after that it is moved with injected scripts.
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setHtml(null);
    return subscribeLiveLocation(
      conversationId,
      message.id,
      (next) => {
        setLocation(next);
        setLoaded(true);
      },
      (error) => {
        console.warn('Location listener error:', error.message);
        setFailed(true);
      }
    );
  }, [conversationId, message.id]);

  useEffect(() => {
    if (!html && location && isValidCoords(location.lat, location.lng)) setHtml(buildMapHtml(location));
  }, [html, location]);

  useEffect(() => {
    if (!html || !location) return;
    const script = setPositionScript(location.lat, location.lng, location.accuracy);
    if (script) webRef.current?.injectJavaScript(script);
  }, [html, location?.lat, location?.lng, location?.accuracy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), STATUS_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const hasPosition = !!location && isValidCoords(location.lat, location.lng);
  const status = location
    ? describeShare({ now, expiresAt: location.expiresAt, active: location.active, updatedAtMs: location.updatedAtMs })
    : null;
  const canStop = isMine && status !== null && status.state !== 'ended';
  const statusColor = status?.state === 'live' ? colors.accent : colors.subText;

  const openInMaps = () => {
    if (!location) return;
    const url = mapsUrl(location.lat, location.lng);
    if (url) Linking.openURL(url).catch(() => {});
  };

  const onNavigate = (request: { url: string }) => {
    const url = request.url;
    if (url.startsWith(MAP_BASE_URL) || url === 'about:blank' || url.startsWith('data:')) return true;
    // A link in the map (the copyright notice) opens in the browser instead of replacing the map.
    if (url.startsWith('https://')) Linking.openURL(url).catch(() => {});
    return false;
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close map">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {isMine ? 'Your live location' : `${sharerName}'s live location`}
          </Text>
        </View>

        <View style={styles.mapArea}>
          {!loaded && !failed && <ActivityIndicator style={styles.center} color={colors.accent} />}
          {(failed || (loaded && !location)) && (
            <Text style={[styles.center, styles.message, { color: colors.subText }]}>
              This location is not available any more.
            </Text>
          )}
          {location && !hasPosition && (
            <Text style={[styles.center, styles.message, { color: colors.subText }]}>No position yet.</Text>
          )}
          {html && WebView && (
            <WebView
              ref={webRef as never}
              source={{ html, baseUrl: MAP_BASE_URL }}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled={false}
              setSupportMultipleWindows={false}
              mixedContentMode="never"
              scrollEnabled={false}
              onShouldStartLoadWithRequest={onNavigate}
              style={styles.web}
            />
          )}
          {html && !WebView && (
            <Text style={[styles.center, styles.message, { color: colors.subText }]}>
              The map is not available in this build. Use "Open in Maps".
            </Text>
          )}
        </View>

        <View
          style={[
            styles.footer,
            { backgroundColor: colors.cardBackground, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 4 },
          ]}
        >
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={[styles.status, { color: colors.text }]} accessibilityLiveRegion="polite">
              {status ? status.label : 'Loading…'}
            </Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={openInMaps}
              disabled={!hasPosition}
              accessibilityRole="button"
              style={[styles.action, { borderColor: colors.border }, !hasPosition && styles.disabled]}
            >
              <Ionicons name="navigate-outline" size={18} color={colors.text} />
              <Text style={[styles.actionText, { color: colors.text }]}>Open in Maps</Text>
            </Pressable>
            {WebView && html && (
              <Pressable
                onPress={() => webRef.current?.injectJavaScript('window.recenter && window.recenter(); true;')}
                accessibilityRole="button"
                style={[styles.action, { borderColor: colors.border }]}
              >
                <Ionicons name="locate-outline" size={18} color={colors.text} />
                <Text style={[styles.actionText, { color: colors.text }]}>Recenter</Text>
              </Pressable>
            )}
            {canStop && (
              <Pressable
                onPress={() => onStop(message)}
                accessibilityRole="button"
                style={[styles.action, { backgroundColor: colors.danger, borderColor: colors.danger }]}
              >
                <Text style={[styles.actionText, { color: '#FFFFFF' }]}>Stop sharing</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  title: { flex: 1, fontSize: 18, fontWeight: '600' },
  mapArea: { flex: 1 },
  web: { flex: 1 },
  center: { position: 'absolute', top: '45%', alignSelf: 'center', zIndex: 1 },
  message: { textAlign: 'center', paddingHorizontal: 32, fontSize: 15 },
  footer: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 14, gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  status: { fontSize: 15, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  actionText: { fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
