/**
 * useActiveGroupCall.ts
 * Whether a group has a call going that the person can join, and how many people are in it.
 *
 * The group's conversation document carries an `activeCall` pointer that people in the call keep refreshing, and every
 * member already receives it. This hook adds one small listener on the call's presence list, only while there is a live
 * call, to count who is really in it (the pointer alone can look fresh for a minute after the last person leaves).
 */

import { useEffect, useState } from 'react';
import { subscribePeers } from '../services/groupCallService';
import { ActiveGroupCall, Conversation } from '../types';
import { createPresenceTracker, isCallLive, showJoinBar } from '../utils/groupCall';

/** How often to re-check whether the call has gone quiet. */
const RECHECK_MS = 10_000;

export function useActiveGroupCall(conversation: Pick<Conversation, 'id' | 'isGroup' | 'activeCall'> | undefined) {
  const pointer: ActiveGroupCall | undefined = conversation?.isGroup ? conversation.activeCall : undefined;
  const conversationId = conversation?.id;
  const callId = pointer?.id;

  const [now, setNow] = useState(() => Date.now());
  const [peersPresent, setPeersPresent] = useState<number | null>(null);

  // Re-evaluate on a slow clock while a call is showing, so an abandoned call drops out by itself.
  useEffect(() => {
    if (!callId) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), RECHECK_MS);
    return () => clearInterval(timer);
  }, [callId]);

  // Count who is in the call. Listens only while the pointer is live.
  const live = isCallLive(pointer, now);
  useEffect(() => {
    setPeersPresent(null);
    if (!conversationId || !callId || !live) return;

    const tracker = createPresenceTracker();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      const at = Date.now();
      setPeersPresent(tracker.present(at).length);
      const wait = tracker.nextExpiryIn(at);
      if (wait !== null) timer = setTimeout(refresh, wait + 50);
    };

    const unsubscribe = subscribePeers(
      conversationId,
      callId,
      (docs) => {
        tracker.update(docs, Date.now());
        refresh();
      },
      (error) => console.warn('Group call presence listener error:', error.message)
    );
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
    // `live` is part of the key so a call that goes quiet stops its listener.
  }, [conversationId, callId, live]);

  const show = showJoinBar({ call: pointer, now, peersPresent, amInCall: false });
  return { call: show ? (pointer ?? null) : null, peersPresent, showBar: show };
}
