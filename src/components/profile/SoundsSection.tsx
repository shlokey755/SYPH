/**
 * SoundsSection.tsx
 * "Sounds & vibration" in the Me tab: vibration on or off, touch feedback on or off, the ringtone for incoming calls and the
 * tone for new messages. Choosing a ringtone or tone plays it once, so it can be heard before it is kept.
 *
 * The choices live on this phone (services/alertPrefsStore.ts) and apply while SYPH is open. While SYPH is closed Android
 * plays the alerts itself, from the phone's own notification settings for SYPH.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Text } from '../parchment';
import { useTheme } from '../../hooks/themeContext';
import { buzz, hasBundledSounds, playTone } from '../../services/alertSounds';
import { setAlertPrefs, useAlertPrefs } from '../../services/alertPrefsStore';
import { getActiveCall } from '../../services/activeCallStore';
import { startRinging, stopRinging } from '../../services/callAudio';
import {
  MESSAGE_BUZZ_PATTERN,
  MESSAGE_TONES,
  MessageToneId,
  RINGTONES,
  RingtoneId,
  ringPlan,
  TOUCH_TICK_MS,
} from '../../utils/alertPrefs';

/** How long a ringtone preview plays. */
const PREVIEW_SECONDS = 3;

export function SoundsSection() {
  const { themeColors } = useTheme();
  const prefs = useAlertPrefs();
  const bundled = hasBundledSounds();

  // Leaving the screen silences a preview that is still playing.
  useEffect(() => () => void stopRinging(), []);

  const chooseRingtone = (ringtone: RingtoneId) => {
    setAlertPrefs({ ringtone });
    if (getActiveCall()) return; // never ring into a call
    stopRinging();
    startRinging(ringPlan({ ...prefs, ringtone }, bundled).source, null, PREVIEW_SECONDS);
  };

  const chooseMessageTone = (messageTone: MessageToneId) => {
    setAlertPrefs({ messageTone });
    if (messageTone !== 'off') playTone(messageTone);
  };

  const row = [styles.row, { borderColor: themeColors.border }];
  const radio = (selected: boolean) => (
    <Ionicons
      name={selected ? 'radio-button-on' : 'radio-button-off'}
      size={20}
      color={selected ? themeColors.accent : themeColors.subText}
    />
  );

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

        <View style={[styles.group, { borderColor: themeColors.border }]}>
          <Text style={[styles.label, { color: themeColors.text }]}>Call ringtone</Text>
          {RINGTONES.map((tone) => (
            <Pressable
              key={tone.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: prefs.ringtone === tone.id }}
              onPress={() => chooseRingtone(tone.id)}
              style={styles.option}
            >
              {radio(prefs.ringtone === tone.id)}
              <View style={styles.grow}>
                <Text style={[styles.optionLabel, { color: themeColors.text }]}>{tone.label}</Text>
                <Text style={[styles.hint, { color: themeColors.subText }]}>{tone.hint}</Text>
              </View>
            </Pressable>
          ))}
          {!bundled && (
            <Text style={[styles.hint, { color: themeColors.subText }]}>
              The SYPH ringtone comes with the newest version of the app. Until you install it, calls ring with your phone's own
              ringtone.
            </Text>
          )}
        </View>

        <View style={[styles.group, styles.last]}>
          <Text style={[styles.label, { color: themeColors.text }]}>Message tone</Text>
          {MESSAGE_TONES.map((tone) => (
            <Pressable
              key={tone.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: prefs.messageTone === tone.id }}
              onPress={() => chooseMessageTone(tone.id)}
              style={styles.option}
            >
              {radio(prefs.messageTone === tone.id)}
              <Text style={[styles.optionLabel, { color: themeColors.text }]}>{tone.label}</Text>
            </Pressable>
          ))}
          {!bundled && (
            <Text style={[styles.hint, { color: themeColors.subText }]}>
              Message tones come with the newest version of the app. Until you install it, new messages only buzz.
            </Text>
          )}
          <Text style={[styles.hint, { color: themeColors.subText }]}>
            These apply while SYPH is open. While it is closed, Android plays the alerts itself: change them under the phone's
            notification settings for SYPH.
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
  group: { padding: 14, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  last: { borderBottomWidth: 0 },
  grow: { flex: 1 },
  label: { fontSize: 18, fontWeight: '600' },
  optionLabel: { fontSize: 17 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  hint: { fontSize: 15 },
});
