/**
 * OnCallChip.tsx
 * The ways back to a call you have stepped away from. A browser has no floating bubble for that (tabs and windows do the job the
 * bubble does on a phone), so the way back is part of the page, and nothing floats over it:
 *   - OnCallChip: a wax-red medallion with a telephone on it and the time of the call beneath, in the desktop rail;
 *   - OnCallBar: a slim wax strip across the top of the page, where there is no rail (a narrow window, or a page outside the app).
 * Both show only while a call is running, and neither shows on the call screens, where you are looking at the call. Only the web
 * shell (DesktopShell.tsx) uses them.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useActiveCall, useDirectSession, useGroupSession } from '../../services/activeCallStore';
import { useTheme } from '../../theme/mapTheme';
import { formatCallClock } from '../../utils/call';
import { CALL_ROUTE, isCallRoute } from '../../utils/callBackground';
import { RoundButton, roundLook, Text } from '../parchment';

/** The call that is running and has not ended, and whether its clock is running yet; null when there is none. */
function useRunningCall() {
  const active = useActiveCall();
  const direct = useDirectSession();
  const group = useGroupSession();
  const session = active?.kind === 'group' ? group : direct;
  if (!active || !session || session.phase === 'ended') return null;
  const live = active.kind === 'group' ? group?.phase === 'in-call' : direct?.phase === 'connected';
  return { kind: active.kind, seconds: session.seconds, live };
}

export function OnCallChip() {
  const { themeColors: c } = useTheme();
  const router = useRouter();
  const call = useRunningCall();
  if (!call) return null;

  return (
    <View style={styles.item}>
      <RoundButton tone="wax" size={50} onPress={() => router.push(CALL_ROUTE[call.kind])} accessibilityLabel="Return to the call">
        <Ionicons name="call" size={22} color={roundLook(c, 'wax').ink} />
      </RoundButton>
      <Text kind="label" style={[styles.label, { color: c.gilt }]}>
        {call.live ? formatCallClock(call.seconds) : 'Call'}
      </Text>
    </View>
  );
}

export function OnCallBar() {
  const { themeColors: c } = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const call = useRunningCall();
  if (!call || isCallRoute(segments)) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Return to the call"
      onPress={() => router.push(CALL_ROUTE[call.kind])}
      style={[styles.bar, { backgroundColor: c.stamp, borderBottomColor: c.brass }]}
    >
      <Ionicons name="call" size={16} color={c.buttonText} />
      <Text kind="label" numberOfLines={1} style={[styles.barText, { color: c.buttonText }]}>
        {call.live ? `On a call · ${formatCallClock(call.seconds)}` : 'Call in progress'}
      </Text>
      <Text kind="label" style={[styles.barText, { color: c.gilt }]}>
        Return
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: { alignItems: 'center', gap: 4 },
  label: { fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 2,
  },
  barText: { fontSize: 14, letterSpacing: 1, textTransform: 'uppercase' },
});
