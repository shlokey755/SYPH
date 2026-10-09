/**
 * useIncomingCalls.tsx
 * Rings the signed-in user while the app is open (FR-06).
 *
 * - Listens for calls addressed to the user that are still "ringing" and shows a full-screen Accept / Decline overlay.
 * - Ignores calls that look abandoned (caller's app died) so a dead call never rings forever.
 * - If the user is already on a call, a new one is declined and reported with a toast.
 * - If this build cannot place calls (Expo Go, web), it says so instead of ringing something that cannot be answered.
 *
 * A call that arrives while the app is closed reaches the user as a push notification (see server/ and API.md); there
 * is no native call screen, so tapping it opens the chat and, if the call is still ringing, this overlay appears.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { declineCall, subscribeIncomingCalls } from '../services/callService';
import { isCallingSupported } from '../services/webrtc';
import { Call } from '../types';
import { STALE_RING_MS, isRingingFresh } from '../utils/call';
import { useAuth } from './useAuth';
import { useTheme } from './themeContext';
import { useToast } from './toastNotifications';

interface IncomingCallsContextType {
  /** The call screen reports here so a second caller is turned away while one call is in progress. */
  setOnCall: (onCall: boolean) => void;
}

const IncomingCallsContext = createContext<IncomingCallsContextType | undefined>(undefined);

/** Firestore timestamps arrive as Timestamp objects; anything else counts as "not resolved yet". */
const createdAtMs = (call: Call): number => {
  const value = call.createdAt as unknown as { toMillis?: () => number } | undefined;
  return typeof value?.toMillis === 'function' ? value.toMillis() : 0;
};

const RING_BUZZ_MS = 1500;

export function IncomingCallsProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const uid = currentUser?.uid;

  const [ringing, setRinging] = useState<Call[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const onCallRef = useRef(false);
  /** Calls already answered, declined, turned away or reported, so a late snapshot never re-triggers them. */
  const handledRef = useRef<Set<string>>(new Set());
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const setOnCall = useCallback((onCall: boolean) => {
    onCallRef.current = onCall;
  }, []);

  useEffect(() => {
    handledRef.current = new Set();
    setRinging([]);
    if (!uid) return;

    return subscribeIncomingCalls(
      uid,
      (calls) => {
        const fresh = calls.filter((c) => !handledRef.current.has(c.id) && isRingingFresh(createdAtMs(c), Date.now()));

        const next: Call[] = [];
        for (const call of fresh) {
          if (onCallRef.current) {
            handledRef.current.add(call.id);
            declineCall(call.id).catch(() => {});
            toastRef.current.info('Missed call', `${call.callerName} called while you were on another call`);
          } else if (!isCallingSupported()) {
            handledRef.current.add(call.id);
            toastRef.current.info(
              `${call.callerName} is calling`,
              'Calls need an installed build of SYPH (they do not work in Expo Go)'
            );
          } else {
            next.push(call);
          }
        }
        setRinging(next);
      },
      (error) => console.warn('Incoming call listener error:', error.message)
    );
  }, [uid]);

  // The newest call is the one shown; an abandoned one drops out once it passes STALE_RING_MS.
  const incoming = useMemo(() => {
    const live = ringing.filter((c) => isRingingFresh(createdAtMs(c), now));
    live.sort((a, b) => createdAtMs(b) - createdAtMs(a));
    return live[0] ?? null;
  }, [ringing, now]);

  useEffect(() => {
    if (!incoming) return;
    const born = createdAtMs(incoming) || Date.now();
    const wait = Math.max(0, born + STALE_RING_MS - Date.now()) + 250;
    const timer = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [incoming]);

  // Vibrate while the overlay is up.
  useEffect(() => {
    if (!incoming) return;
    Vibration.vibrate();
    const timer = setInterval(() => Vibration.vibrate(), RING_BUZZ_MS);
    return () => {
      clearInterval(timer);
      Vibration.cancel();
    };
  }, [incoming]);

  const accept = useCallback(
    (call: Call) => {
      handledRef.current.add(call.id);
      setRinging((list) => list.filter((c) => c.id !== call.id));
      router.push({ pathname: '/call/[id]', params: { id: call.id } });
    },
    [router]
  );

  const decline = useCallback((call: Call) => {
    handledRef.current.add(call.id);
    setRinging((list) => list.filter((c) => c.id !== call.id));
    declineCall(call.id).catch((error) => console.warn('Decline failed:', error.message));
  }, []);

  const value = useMemo(() => ({ setOnCall }), [setOnCall]);

  return (
    <IncomingCallsContext.Provider value={value}>
      {children}
      <IncomingCallOverlay call={incoming} onAccept={accept} onDecline={decline} />
    </IncomingCallsContext.Provider>
  );
}

export function useIncomingCalls(): IncomingCallsContextType {
  const ctx = useContext(IncomingCallsContext);
  if (!ctx) throw new Error('useIncomingCalls must be used within an IncomingCallsProvider');
  return ctx;
}

function IncomingCallOverlay({
  call,
  onAccept,
  onDecline,
}: {
  call: Call | null;
  onAccept: (call: Call) => void;
  onDecline: (call: Call) => void;
}) {
  const { themeColors } = useTheme();
  const insets = useSafeAreaInsets();

  if (!call) return null;
  const isVideo = call.type === 'video';
  const initial = (call.callerName || '?').charAt(0).toUpperCase();

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => onDecline(call)}>
      <View
        style={[
          styles.container,
          { backgroundColor: themeColors.background, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 40 },
        ]}
      >
        <View style={styles.who}>
          <View style={[styles.avatar, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.accent }]}>
            <Text style={[styles.initial, { color: themeColors.accent }]}>{initial}</Text>
          </View>
          <Text style={[styles.name, { color: themeColors.text }]} numberOfLines={1}>
            {call.callerName}
          </Text>
          <Text style={[styles.kind, { color: themeColors.subText }]}>
            Incoming {isVideo ? 'video' : 'voice'} call
          </Text>
        </View>

        <View style={styles.actions}>
          <View style={styles.action}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decline call"
              onPress={() => onDecline(call)}
              style={[styles.round, { backgroundColor: themeColors.danger }]}
            >
              <Ionicons name="call" size={30} color="#FFFFFF" style={styles.hangUpIcon} />
            </Pressable>
            <Text style={[styles.label, { color: themeColors.subText }]}>Decline</Text>
          </View>

          <View style={styles.action}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Accept call"
              onPress={() => onAccept(call)}
              style={[styles.round, { backgroundColor: ACCEPT_GREEN }]}
            >
              <Ionicons name={isVideo ? 'videocam' : 'call'} size={30} color="#FFFFFF" />
            </Pressable>
            <Text style={[styles.label, { color: themeColors.subText }]}>Accept</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Accept is green in every theme so it is never confused with Decline. */
const ACCEPT_GREEN = '#22C55E';

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32 },
  who: { alignItems: 'center', gap: 12 },
  avatar: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  initial: { fontSize: 52, fontWeight: '600' },
  name: { fontSize: 28, fontWeight: '600', maxWidth: 300 },
  kind: { fontSize: 16 },
  actions: { flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch' },
  action: { alignItems: 'center', gap: 10 },
  round: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  // The phone glyph points up-right; turned over it reads as "hang up".
  hangUpIcon: { transform: [{ rotate: '135deg' }] },
  label: { fontSize: 14 },
});
