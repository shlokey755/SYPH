/**
 * SoundsSection.tsx (browser copy)
 * "Sounds & vibration" in the Me tab: vibration on or off and touch feedback on or off. SYPH has no sounds of its own: calls
 * and messages use the sounds of the device they arrive on (the phone's ringtone and notification sound), so a browser has
 * nothing to choose. The switches live on this device (services/alertPrefsStore.ts).
 */

import React from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Text } from '../parchment';
import { useTheme } from '../../theme/mapTheme';
import { buzz } from '../../services/alertSounds';
import { setAlertPrefs, useAlertPrefs } from '../../services/alertPrefsStore';
import { MESSAGE_BUZZ_PATTERN, TOUCH_TICK_MS } from '../../utils/alertPrefs';

export function SoundsSection() {
  const { themeColors } = useTheme();
  const prefs = useAlertPrefs();

  const row = [styles.row, { borderColor: themeColors.border }];
  return (
    <View style={styles.section}>
      <Text kind="label" style={[styles.title, { color: themeColors.stamp }]}>Sounds & vibration</Text>
      <View style={[styles.card, { backgroundColor: themeColors.paper, borderColor: themeColors.trail }]}>
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
            trackColor={{ true: themeColors.accent, false: themeColors.paperAlt }}
            thumbColor={themeColors.paper}
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
            trackColor={{ true: themeColors.accent, false: themeColors.paperAlt }}
            thumbColor={themeColors.paper}
          />
        </View>

        <View style={styles.note}>
          <Text style={[styles.hint, { color: themeColors.subText }]}>
            SYPH has no sounds of its own: a call or a message uses the ringtone and notification sound of the phone it arrives
            on. Vibration and touch feedback only apply on a phone.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 15, marginBottom: 25 },
  title: { fontSize: 17, letterSpacing: 1, marginBottom: 10 },
  card: { borderRadius: 4, borderWidth: 1.5, borderStyle: 'dashed', overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  note: { padding: 14 },
  grow: { flex: 1 },
  label: { fontSize: 18, fontWeight: '600' },
  hint: { fontSize: 15 },
});
