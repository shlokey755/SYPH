/**
 * SoundsSection.tsx
 * "Sounds & vibration" in the Me tab: vibration on or off, touch feedback on or off, and the phone's own call ringtone and
 * notification sound with a button to hear each.
 *
 * SYPH has no sounds of its own. Calls ring with the ringtone chosen in the phone's settings, and new messages use the phone's
 * notification sound, the same whether SYPH is open or closed. To change either, use the phone's sound settings (the button
 * opens them). The two switches live on this phone (services/alertPrefsStore.ts) and apply while SYPH is open; while it is
 * closed Android decides the buzz from the notification settings for SYPH.
 */

import React, { useEffect } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../../hooks/themeContext';
import { buzz } from '../../services/alertSounds';
import { setAlertPrefs, useAlertPrefs } from '../../services/alertPrefsStore';
import { getActiveCall } from '../../services/activeCallStore';
import { startRinging, stopRinging } from '../../services/callAudio';
import { playPhoneMessageSound } from '../../services/callOverlay';
import { MESSAGE_BUZZ_PATTERN, ringPlan, TOUCH_TICK_MS } from '../../utils/alertPrefs';

/** How long the ringtone test plays. */
const PREVIEW_SECONDS = 3;

/** Opens Android's own sound settings, where the ringtone and notification sound are chosen; SYPH's app settings if that fails. */
function openPhoneSoundSettings() {
  if (Platform.OS !== 'android') return void Linking.openSettings();
  Linking.sendIntent('android.settings.SOUND_SETTINGS').catch(() => void Linking.openSettings());
}

export function SoundsSection() {
  const { themeColors } = useTheme();
  const prefs = useAlertPrefs();

  // Leaving the screen silences a test that is still playing.
  useEffect(() => () => void stopRinging(), []);

  const testRingtone = () => {
    if (getActiveCall()) return; // never ring into a call
    stopRinging();
    startRinging(ringPlan({ ...prefs, vibrate: false }).pattern, PREVIEW_SECONDS);
  };

  const row = [styles.row, { borderColor: themeColors.border }];
  const testButton = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.button, { borderColor: themeColors.accent }]}
    >
      <Text style={[styles.buttonText, { color: themeColors.accent }]}>Test</Text>
    </Pressable>
  );

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: themeColors.subText }]}>Sounds & vibration</Text>
      <View style={[styles.card, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
        <View style={row}>
          <View style={styles.grow}>
            <Text style={[styles.label, { color: themeColors.text }]}>Vibration</Text>
            <Text style={[styles.hint, { color: themeColors.subText }]}>Buzz for ringing calls and new messages</Text>
          </View>
          <Switch
            value={prefs.vibrate}
            onValueChange={(vibrate) => {
              setAlertPrefs({ vibrate });
              if (vibrate) buzz([...MESSAGE_BUZZ_PATTERN]);
            }}
            trackColor={{ true: themeColors.accent, false: themeColors.border }}
          />
        </View>

        <View style={row}>
          <View style={styles.grow}>
            <Text style={[styles.label, { color: themeColors.text }]}>Touch feedback</Text>
            <Text style={[styles.hint, { color: themeColors.subText }]}>
              A tick when you send a message, and a pulse when a call connects or ends
            </Text>
          </View>
          <Switch
            value={prefs.touchFeedback}
            onValueChange={(touchFeedback) => {
              setAlertPrefs({ touchFeedback });
              if (touchFeedback) buzz(TOUCH_TICK_MS);
            }}
            trackColor={{ true: themeColors.accent, false: themeColors.border }}
          />
        </View>

        <View style={row}>
          <View style={styles.grow}>
            <Text style={[styles.label, { color: themeColors.text }]}>Call ringtone</Text>
            <Text style={[styles.hint, { color: themeColors.subText }]}>Your phone's own ringtone</Text>
          </View>
          {testButton('Test the call ringtone', testRingtone)}
        </View>

        <View style={row}>
          <View style={styles.grow}>
            <Text style={[styles.label, { color: themeColors.text }]}>Message sound</Text>
            <Text style={[styles.hint, { color: themeColors.subText }]}>Your phone's own notification sound</Text>
          </View>
          {testButton('Test the message sound', () => void playPhoneMessageSound(1))}
        </View>

        <View style={styles.note}>
          <Text style={[styles.hint, { color: themeColors.subText }]}>
            SYPH uses the sounds you chose in your phone's settings, with SYPH open or closed. Change them there; the silent and
            vibrate modes of the phone are respected.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open the phone's sound settings"
            onPress={openPhoneSoundSettings}
            style={[styles.button, styles.settingsButton, { borderColor: themeColors.accent }]}
          >
            <Text style={[styles.buttonText, { color: themeColors.accent }]}>Open phone sound settings</Text>
          </Pressable>
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
  grow: { flex: 1 },
  label: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12 },
  button: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  buttonText: { fontSize: 13, fontWeight: '600' },
  note: { padding: 14, gap: 10 },
  settingsButton: { alignSelf: 'flex-start' },
});
