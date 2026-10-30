/**
 * LocationShareSheet.tsx
 * The "Share location" popup, opened by holding the send button. Shaped like the one in Google Maps: a map preview of
 * where you are, "Send your current location" (a one-time pin) and "Share live location" for 15 min, 1 h or 8 h.
 * While a live share is running in this chat it offers Stop. The preview is OpenStreetMap in a WebView (free, no key).
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../hooks/themeContext';
import { LiveShare, PositionFailure, readCurrentPosition } from '../../services/liveLocationManager';
import { LivePosition } from '../../services/locationService';
import { SHARE_DURATIONS, formatDuration } from '../../utils/location';
import { MAP_BASE_URL, buildMapHtml } from '../../utils/mapHtml';
import { loadWebView } from './loadWebView';

interface Props {
  visible: boolean;
  colors: ThemeColors;
  /** The share already running in this chat, if any. */
  activeShare: LiveShare | null;
  /** What is being sent right now: the pin, or a live share. The sheet locks while it works. */
  busy: 'none' | 'pin' | 'live';
  /** Who will see it, for the sentence at the bottom ("Alice" or "everyone in this group"). */
  audience: string;
  /** Whether sharing can continue while SYPH is closed ("allow all the time"). */
  backgroundOn: boolean;
  onSendCurrent: () => void;
  onStartLive: (durationMs: number) => void;
  onStop: () => void;
  onEnableBackground: () => void;
  onClose: () => void;
}

export function LocationShareSheet(props: Props) {
  // Mounting only while it is open means the position is read and the WebView exists only then.
  if (!props.visible) return null;
  return <Sheet {...props} />;
}

type Preview = { state: 'loading' } | { state: 'ready'; position: LivePosition } | { state: 'failed'; reason: PositionFailure };

function Sheet({
  colors,
  activeShare,
  busy,
  audience,
  backgroundOn,
  onSendCurrent,
  onStartLive,
  onStop,
  onEnableBackground,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const WebView = useMemo(loadWebView, []);
  const [preview, setPreview] = useState<Preview>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPreview({ state: 'loading' });
    readCurrentPosition({ fast: true }).then((result) => {
      if (cancelled) return;
      setPreview(result.ok ? { state: 'ready', position: result.position } : { state: 'failed', reason: result.reason });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const html = useMemo(
    () => (preview.state === 'ready' ? buildMapHtml(preview.position) : null),
    [preview]
  );
  const locked = busy !== 'none';
  const accuracy = preview.state === 'ready' ? preview.position.accuracy : null;

  const onNavigate = (request: { url: string }) =>
    request.url.startsWith(MAP_BASE_URL) || request.url === 'about:blank' || request.url.startsWith('data:');

  return (
    <Modal visible transparent animationType="slide" onRequestClose={locked ? undefined : onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={locked ? undefined : onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: colors.cardBackground, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 8 },
          ]}
        >
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text }]}>Share location</Text>
            {!locked && (
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={colors.subText} />
              </Pressable>
            )}
          </View>

          {/* Map preview */}
          <View style={[styles.map, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            {html && WebView ? (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <WebView
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
              </View>
            ) : (
              <View style={styles.mapMessage}>
                {preview.state === 'loading' && (
                  <>
                    <ActivityIndicator color={colors.accent} />
                    <Text style={{ color: colors.subText }}>Finding your location…</Text>
                  </>
                )}
                {preview.state === 'ready' && !WebView && (
                  <Text style={{ color: colors.subText, textAlign: 'center' }}>Map preview is not available in this build.</Text>
                )}
                {preview.state === 'failed' && (
                  <>
                    <Ionicons name="location-outline" size={28} color={colors.subText} />
                    <Text style={{ color: colors.subText, textAlign: 'center' }}>
                      {preview.reason === 'no-position'
                        ? 'Could not find your location. Check that location is turned on.'
                        : 'SYPH needs permission to see your location.'}
                    </Text>
                    <Pressable
                      onPress={() => (preview.reason === 'permission-blocked' ? Linking.openSettings() : setAttempt((n) => n + 1))}
                      accessibilityRole="button"
                      style={[styles.smallButton, { borderColor: colors.accent }]}
                    >
                      <Text style={{ color: colors.accent, fontWeight: '600' }}>
                        {preview.reason === 'permission-blocked' ? 'Open settings' : 'Try again'}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}
          </View>

          {/* Send current location */}
          <Pressable
            onPress={onSendCurrent}
            disabled={locked}
            accessibilityRole="button"
            accessibilityLabel="Send your current location"
            style={({ pressed }) => [styles.row, { borderColor: colors.border, backgroundColor: pressed ? colors.inputBg : 'transparent' }, locked && styles.dim]}
          >
            <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
              <Ionicons name="navigate" size={20} color={colors.buttonText} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Send your current location</Text>
              <Text style={[styles.rowSub, { color: colors.subText }]}>
                {accuracy ? `Accurate to ${Math.max(1, Math.round(accuracy))} m` : 'Sent once, does not move'}
              </Text>
            </View>
            {busy === 'pin' ? <ActivityIndicator color={colors.accent} /> : <Ionicons name="chevron-forward" size={18} color={colors.subText} />}
          </Pressable>

          {/* Live location */}
          {activeShare ? (
            <View style={[styles.liveBox, { borderColor: colors.border }]}>
              <View style={styles.liveHead}>
                <Ionicons name="radio" size={20} color={colors.accent} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>Sharing your live location</Text>
                  <Text style={[styles.rowSub, { color: colors.subText }]}>
                    Ends in {formatDuration(activeShare.expiresAt - Date.now())}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={onStop}
                disabled={locked}
                accessibilityRole="button"
                style={[styles.stop, { backgroundColor: colors.danger }]}
              >
                <Text style={styles.stopText}>Stop sharing</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.liveBox, { borderColor: colors.border }, locked && styles.dim]}>
              <View style={styles.liveHead}>
                <Ionicons name="radio-outline" size={20} color={colors.accent} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>Share live location</Text>
                  <Text style={[styles.rowSub, { color: colors.subText }]}>Updates as you move. Pick how long.</Text>
                </View>
                {busy === 'live' && <ActivityIndicator color={colors.accent} />}
              </View>
              <View style={styles.chips}>
                {SHARE_DURATIONS.map((duration) => (
                  <Pressable
                    key={duration.id}
                    onPress={() => onStartLive(duration.ms)}
                    disabled={locked}
                    accessibilityRole="button"
                    accessibilityLabel={`Share live location for ${duration.label}`}
                    style={({ pressed }) => [
                      styles.chip,
                      { borderColor: colors.accent, backgroundColor: pressed ? colors.inputBg : 'transparent' },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: colors.accent }]}>{duration.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Background sharing */}
          {!backgroundOn && (
            <Pressable onPress={onEnableBackground} accessibilityRole="button" style={styles.bgRow}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.subText} />
              <Text style={[styles.bgText, { color: colors.subText }]}>
                Live sharing pauses when SYPH is closed.{' '}
                <Text style={{ color: colors.accent, fontWeight: '600' }}>Keep it going</Text>
              </Text>
            </Pressable>
          )}

          <Text style={[styles.note, { color: colors.subText }]}>
            {audience} will see where you are. You can stop any time.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700' },
  map: { height: 170, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  web: { flex: 1, backgroundColor: 'transparent' },
  mapMessage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  smallButton: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12 },
  rowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSub: { fontSize: 12 },
  liveBox: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', gap: 10 },
  chip: { flex: 1, borderWidth: 1.5, borderRadius: 20, paddingVertical: 9, alignItems: 'center' },
  chipText: { fontSize: 14, fontWeight: '700' },
  stop: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  stopText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  bgRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bgText: { flex: 1, fontSize: 12, lineHeight: 17 },
  note: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  dim: { opacity: 0.5 },
});
