/**
 * useTyping.ts
 * The "typing…" indicator for one open chat: who else is typing, and telling others when you are.
 * Both halves do nothing while `enabled` is false (offline, chat not on screen, app in the background).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { clearTyping, subscribeTyping, writeTyping } from '../services/typingService';
import { createTypingTracker, nextTypingAction } from '../utils/typing';

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Uids (never your own) of the people typing in this conversation right now. */
export function useTypingPeers(conversationId: string | undefined, myUid: string | undefined, enabled: boolean) {
  const [uids, setUids] = useState<string[]>([]);

  useEffect(() => {
    if (!conversationId || !myUid || !enabled) {
      setUids([]);
      return;
    }
    const tracker = createTypingTracker();
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Re-evaluates now and schedules the next check for when someone would expire.
    const refresh = () => {
      if (timer) clearTimeout(timer);
      const now = Date.now();
      const active = tracker.active(now);
      setUids((previous) => (sameList(previous, active) ? previous : active));
      const wait = tracker.nextExpiryIn(now);
      if (wait !== null) timer = setTimeout(refresh, wait + 50);
    };

    const unsubscribe = subscribeTyping(
      conversationId,
      myUid,
      (docs) => {
        tracker.update(docs, Date.now());
        refresh();
      },
      (error) => console.warn('Typing listener error:', error.message)
    );

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      tracker.reset();
      setUids([]);
    };
  }, [conversationId, myUid, enabled]);

  return uids;
}

/** Call `onTextChange` with the composer text on every edit and `stop` when a message is sent. */
export function useTypingReporter(conversationId: string | undefined, myUid: string | undefined, enabled: boolean) {
  const stateRef = useRef({ typing: false, lastSentAt: 0 });

  const stop = useCallback(() => {
    if (!stateRef.current.typing) return;
    stateRef.current = { typing: false, lastSentAt: 0 };
    if (conversationId && myUid) clearTyping(conversationId, myUid).catch(() => {});
  }, [conversationId, myUid]);

  const onTextChange = useCallback(
    (text: string) => {
      if (!conversationId || !myUid || !enabled) return;
      const now = Date.now();
      const action = nextTypingAction(text, stateRef.current, now);
      if (action === 'start' || action === 'refresh') {
        stateRef.current = { typing: true, lastSentAt: now };
        writeTyping(conversationId, myUid).catch(() => {});
      } else if (action === 'stop') {
        stop();
      }
    },
    [conversationId, myUid, enabled, stop]
  );

  // Leaving the chat, switching chats, going offline or to the background all end "typing".
  useEffect(() => {
    if (!enabled) stop();
    return stop;
  }, [enabled, stop]);

  return { onTextChange, stop };
}
