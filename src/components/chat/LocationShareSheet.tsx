/**
 * LocationShareSheet.tsx
 * Bottom sheet opened by the location button: pick how long to share your live location, or stop a share that is
 * already running in this chat. Says plainly who can see it and that updates need SYPH to stay open.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../hooks/themeContext';
import { LiveShare } from '../../services/liveLocationManager';
import { SHARE_DURATIONS, formatDuration } from '../../utils/location';

interface Props {
  visible: boolean;
  colors: ThemeColors;
  /** The share already running in this chat, if any. */
  activeShare: LiveShare | null;
  /** True while the first position is being read and the message is being sent. */
  starting: boolean;
  /** Who will see it, for the sentence under the title ("Alice" or "everyone in this group"). */
  audience: string;
  onStart: (durationMs: number) => void;
  onStop: () => void;
  onClose: () => void;
}

export function LocationShareSheet({ visible, colors, activeShare, starting, audience, onStart, onStop, onClose }: Props) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={starting ? undefined : onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: colors.cardBackground, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 8 },
          ]}
        >
          <View style={styles.titleRow}>
            <Ionicons name="location" size={22} color={colors.accent} />
            <Text style={[styles.title, { color: colors.text }]}>
              {activeShare ? 'Sharing your live location' : 'Share live location'}
            </Text>
          </View>

          {activeShare ? (
            <>
              <Text style={[styles.body, { color: colors.subText }]}>
                {audience} can see where you are. It ends by itself in {formatDuration(activeShare.expiresAt - Date.now())}.
              </Text>
              <Pressable
                onPress={onStop}
                accessibilityRole="button"
                style={[styles.button, { backgroundColor: colors.danger }]}
              >
                <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>Stop sharing</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.body, { color: colors.subText }]}>
                {audience} will see where you are on a map until it ends. You can stop any time. Updates only continue
                while SYPH stays open on your phone.
              </Text>
              {starting ? (
                <View style={styles.starting}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={{ color: colors.subText }}>Finding your location…</Text>
                </View>
              ) : (
                SHARE_DURATIONS.map((duration) => (
                  <Pressable
                    key={duration.id}
                    onPress={() => onStart(duration.ms)}
                    accessibilityRole="button"
                    accessibilityLabel={`Share for ${duration.label}`}
                    style={({ pressed }) => [
                      styles.option,
                      { borderColor: colors.border, backgroundColor: pressed ? colors.inputBg : 'transparent' },
                    ]}
                  >
                    <Text style={[styles.optionText, { color: colors.text }]}>For {duration.label}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.subText} />
                  </Pressable>
                ))
              )}
            </>
          )}

          {!starting && (
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
              <Text style={[styles.cancelText, { color: colors.subText }]}>{activeShare ? 'Close' : 'Cancel'}</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, padding: 20, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  optionText: { fontSize: 16 },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' },
  starting: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 20, justifyContent: 'center' },
  cancel: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { fontSize: 15 },
});
