/**
 * useIncomingCalls.tsx
 * Rings the signed-in user while the app is open (FR-06).
 *
 * - Listens for calls addressed to the user that are still "ringing" and shows a full-screen Accept / Decline overlay.
 * - Ignores calls that look abandoned (caller's app died) so a dead call never rings forever.
 * - If the user is already on a call, a new one is declined and reported with a toast.
 * - If this build cannot place calls (Expo Go, web), it says so instead of ringing something that cannot be answered.
 * - A group call rings the same way for a short while after someone starts it (the group's `activeCall` pointer, which
 *   the conversations listener already delivers). Declining a group call only dismisses it on this phone.
 *
 * A call that arrives while the app is closed reaches the user as a push notification (sent from the caller's phone,
 * see pushSender.ts and API.md; or from the optional relay in server/); there
 * is no native call screen, so tapping it opens the chat and, if the call is still ringing, this overlay appears.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { declineCall, subscribeIncomingCalls } from '../services/callService';
import { isCallingSupported } from '../services/webrtc';
import { ActiveGroupCall, Call, CallType } from '../types';
import { STALE_RING_MS, isRingingFresh } from '../utils/call';
import { RING_WINDOW_MS, callHeadline, shouldRing } from '../utils/groupCall';
import { useAuth } from './useAuth';
import { useConversations } from './useConversations';
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

/** What the full-screen ring shows; built from either a 1-to-1 call or a group call. */
interface RingInfo {
  key: string;
  name: string;
  kind: string;
  type: CallType;
}

interface GroupRing {
  conversationId: string;
  groupName: string;
  call: ActiveGroupCall;
}

export function IncomingCallsProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const uid = currentUser?.uid;

  const { conversations } = useConversations();
  const [ringing, setRinging] = useState<Call[]>([]);
  const [now, setNow] = useState(() => Date.now());
  /** Group calls already joined, dismissed or reported. A ref plus a counter, so marking one re-evaluates the ring. */
  const groupHandledRef = useRef<Set<string>>(new Set());
  const [groupVersion, setGroupVersion] = useState(0);

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
    groupHandledRef.current = new Set();
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

  // A group call someone just started. The newest one is the candidate.
  const groupCandidate = useMemo<GroupRing | null>(() => {
    if (!uid) return null;
    let best: GroupRing | null = null;
    for (const c of conversations) {
      const call = c.activeCall;
      if (!c.isGroup || !call) continue;
      if (!shouldRing(call, uid, now, groupHandledRef.current.has(call.id))) continue;
      if (!best || call.startedAt > best.call.startedAt) {
        best = { conversationId: c.id, groupName: c.groupName || 'Group', call };
      }
    }
    return best;
    // groupVersion changes when a call is marked handled; now moves the ring window along.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, uid, now, groupVersion]);

  // Busy or unsupported: do not ring, say why once.
  useEffect(() => {
    if (!groupCandidate) return;
    const { call, groupName } = groupCandidate;
    if (onCallRef.current) {
      groupHandledRef.current.add(call.id);
      toastRef.current.info(groupName, `${callHeadline(call)} while you were on another call`);
      setGroupVersion((v) => v + 1);
    } else if (!isCallingSupported()) {
      groupHandledRef.current.add(call.id);
      toastRef.current.info(
        groupName,
        `${callHeadline(call)}. Calls need an installed build of SYPH (they do not work in Expo Go)`
      );
      setGroupVersion((v) => v + 1);
    }
  }, [groupCandidate]);

  // Move the ring window along: re-check when the group ring would stop.
  useEffect(() => {
    if (!groupCandidate) return;
    const wait = Math.max(0, groupCandidate.call.startedAt + RING_WINDOW_MS - Date.now()) + 250;
    const timer = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [groupCandidate]);

  const ring = useMemo<RingInfo | null>(() => {
    if (incoming) {
      return {
        key: incoming.id,
        name: incoming.callerName,
        kind: `Incoming ${incoming.type === 'video' ? 'video' : 'voice'} call`,
        type: incoming.type,
      };
    }
    if (groupCandidate) {
      return {
        key: `group:${groupCandidate.call.id}`,
        name: groupCandidate.groupName,
        kind: callHeadline(groupCandidate.call),
        type: groupCandidate.call.type,
      };
    }
    return null;
  }, [incoming, groupCandidate]);

  // Vibrate while the overlay is up.
  const ringKey = ring?.key ?? null;
  useEffect(() => {
    if (!ringKey) return;
    Vibration.vibrate();
    const timer = setInterval(() => Vibration.vibrate(), RING_BUZZ_MS);
    return () => {
      clearInterval(timer);
      Vibration.cancel();
    };
  }, [ringKey]);

  const accept = useCallback(() => {
    if (incoming) {
      handledRef.current.add(incoming.id);
      setRinging((list) => list.filter((c) => c.id !== incoming.id));
      router.push({ pathname: '/call/[id]', params: { id: incoming.id } });
    } else if (groupCandidate) {
      const { call, conversationId } = groupCandidate;
      groupHandledRef.current.add(call.id);
      setGroupVersion((v) => v + 1);
      router.push({ pathname: '/group-call/[id]', params: { id: call.id, conversationId, type: call.type } });
    }
  }, [incoming, groupCandidate, router]);

  const decline = useCallback(() => {
    if (incoming) {
      handledRef.current.add(incoming.id);
      setRinging((list) => list.filter((c) => c.id !== incoming.id));
      declineCall(incoming.id).catch((error) => console.warn('Decline failed:', error.message));
    } else if (groupCandidate) {
      // A group call has nobody to tell: dismissing only silences it on this phone.
      groupHandledRef.current.add(groupCandidate.call.id);
      setGroupVersion((v) => v + 1);
    }
  }, [incoming, groupCandidate]);

  const value = useMemo(() => ({ setOnCall }), [setOnCall]);

  return (
    <IncomingCallsContext.Provider value={value}>
      {children}
      <IncomingCallOverlay ring={ring} onAccept={accept} onDecline={decline} />
    </IncomingCallsContext.Provider>
  );
}

export function useIncomingCalls(): IncomingCallsContextType {
  const ctx = useContext(IncomingCallsContext);
  if (!ctx) throw new Error('useIncomingCalls must be used within an IncomingCallsProvider');
  return ctx;
}

function IncomingCallOverlay({
  ring,
  onAccept,
  onDecline,
}: {
  ring: RingInfo | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { themeColors } = useTheme();
  const insets = useSafeAreaInsets();

  if (!ring) return null;
  const isVideo = ring.type === 'video';
  const initial = (ring.name || '?').charAt(0).toUpperCase();

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onDecline}>
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
            {ring.name}
          </Text>
          <Text style={[styles.kind, { color: themeColors.subText }]}>{ring.kind}</Text>
        </View>

        <View style={styles.actions}>
          <View style={styles.action}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decline call"
              onPress={onDecline}
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
              onPress={onAccept}
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
