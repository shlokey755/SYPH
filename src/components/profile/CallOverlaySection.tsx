/**
 * CallOverlaySection.tsx
 * "Calls over other apps" in the Me tab: the two Android permissions behind the floating call bubble and the full-screen
 * incoming-call screen, each with its state and a button to the Android settings page where it is switched on.
 *
 * Android does not let an app switch these on by itself, so SYPH can only show the state and open the right page. The state
 * is read again whenever SYPH comes back to the screen, so it is up to date after the person returns from Settings.
 * Android only; hidden elsewhere.
 */

import React, { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../hooks/themeContext';
import {
  canDrawOverApps,
  canUseFullScreen,
  isOverlayAvailable,
  openFullScreenSettings,
  openOverlaySettings,
} from '../../services/callOverlay';
import { OverlayAccess, overlayStatus, PermissionStatus } from '../../utils/callOverlay';

const readAccess = (): OverlayAccess => ({
  available: isOverlayAvailable(),
  overApps: canDrawOverApps(),
  fullScreen: canUseFullScreen(),
});

const STATUS_TEXT: Record<PermissionStatus, string> = {
  unavailable: 'Comes with the newest version of the app',
  granted: 'On',
  needed: 'Off',
};

export function CallOverlaySection() {
  const { themeColors } = useTheme();
  const [access, setAccess] = useState<OverlayAccess>(readAccess);

  useEffect(() => {
    setAccess(readAccess());
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setAccess(readAccess());
    });
    return () => subscription.remove();
  }, []);

  if (Platform.OS !== 'android') return null;
  const status = overlayStatus(access);

  const row = (
    title: string,
    hint: string,
    state: PermissionStatus,
    open: () => boolean,
    last = false
  ) => (
    <View style={[styles.row, { borderColor: themeColors.border }, last && styles.last]}>
      <View style={styles.grow}>
        <Text style={[styles.label, { color: themeColors.text }]}>{title}</Text>
        <Text style={[styles.hint, { color: themeColors.subText }]}>{hint}</Text>
        <Text style={[styles.state, { color: state === 'granted' ? themeColors.accent : themeColors.subText }]}>
          {STATUS_TEXT[state]}
        </Text>
      </View>
      {state === 'needed' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open settings for ${title}`}
          onPress={() => open()}
          style={[styles.button, { borderColor: themeColors.accent }]}
        >
          <Text style={[styles.buttonText, { color: themeColors.accent }]}>Open settings</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: themeColors.subText }]}>Calls over other apps</Text>
      <View style={[styles.card, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
        {row(
          'Display over other apps',
          'A floating bubble with the call clock while you use another app, and a ringing call that opens straight away',
          status.overApps,
          openOverlaySettings
        )}
        {row(
          'Full-screen call alerts',
          'A ringing call takes over the lock screen (Android 14 and newer ask for this)',
          status.fullScreen,
          openFullScreenSettings
        )}
        <View style={styles.note}>
          <Text style={[styles.hint, { color: themeColors.subText }]}>
            This works while SYPH is running in the background. If Android has already closed SYPH, a call arrives as a
            notification, as before. Some phones (Xiaomi, Oppo, Vivo, Huawei) also have a switch for pop-up windows while an app
            is in the background, under the phone's permission settings for SYPH.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 15, marginBottom: 25 },
  title: { fontSize: 12, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase' },
  card: { borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  last: { borderBottomWidth: 0 },
  grow: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12 },
  state: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  button: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  buttonText: { fontSize: 13, fontWeight: '600' },
  note: { padding: 14 },
});
