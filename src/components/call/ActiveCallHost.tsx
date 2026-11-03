/**
 * ActiveCallHost.tsx
 * Runs the call SYPH is in, above the screens, so leaving the call screen no longer ends it.
 *
 * `ActiveCallProvider` sits near the root of the app. When a call screen asks for a call (services/activeCallStore.ts)
 * it mounts a host for it; the host runs the call hook, publishes the session for the screens and the floating bubble to
 * draw, and looks after everything that has to happen while SYPH is not on screen:
 *
 *   - an Android foreground service with an ongoing notification ("End call", tap to return) that keeps the microphone
 *     and the process alive (services/callForeground.ts, modules/syph-call-service)
 *   - the camera is switched off when SYPH goes to the background and back on when it returns
 *   - "End call" on the notification hangs up
 *   - this device counts as busy for new incoming calls
 *
 * The call ends only when the person hangs up, the other side ends it, or the connection is lost: never because a screen
 * closed.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { useCallSession } from '../../hooks/useCallSession';
import { useConversations } from '../../hooks/useConversations';
import { useGroupCallSession } from '../../hooks/useGroupCallSession';
import { useIncomingCalls } from '../../hooks/useIncomingCalls';
import {
  ActiveDirectCall,
  ActiveGroupCall,
  DirectSession,
  GroupSession,
  publishSession,
  releaseCall,
  unpublishSession,
  useActiveCall,
} from '../../services/activeCallStore';
import { consumeEndRequest, onEndCallRequested, showCallService, stopCallService } from '../../services/callForeground';
import { CallType } from '../../types';
import { CallKind, CallStage, callNotificationInfo, cameraAction, clockStart, ENDED_LINGER_MS } from '../../utils/callBackground';
import { ReturnToCallBubble } from './ReturnToCallBubble';

interface HostInput {
  /** Identifies this call in the store. */
  callKey: string;
  kind: CallKind;
  session: DirectSession | GroupSession;
  type: CallType;
  /** The other person, or the group's name. */
  name: string;
  stage: CallStage;
  seconds: number;
  /** The microphone is open: only then may the foreground service start (Android 14 refuses it before). */
  hasMedia: boolean;
  ended: boolean;
  cameraOff: boolean;
  hangUp: () => void;
  toggleCamera: () => void;
}

/** Everything a host does besides running the call itself. */
function useBackgroundCall(input: HostInput) {
  const { setOnCall } = useIncomingCalls();
  const { callKey, session, kind, type, name, stage, hasMedia, ended } = input;

  // The latest values, for callbacks that outlive a render (app-state and notification events).
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  });

  // Publish for the screens and the bubble. Every render, because the session object is new every render.
  useEffect(() => {
    publishSession(callKey, session);
  });
  useEffect(() => () => unpublishSession(callKey), [callKey]);

  // An ended call stays up long enough for its closing message to be read; the screen normally closes it sooner.
  useEffect(() => {
    if (!ended) return;
    const timer = setTimeout(() => releaseCall(callKey), ENDED_LINGER_MS);
    return () => clearTimeout(timer);
  }, [ended, callKey]);

  // Busy for new incoming calls for as long as this call exists.
  useEffect(() => {
    setOnCall(true);
    return () => setOnCall(false);
  }, [setOnCall]);

  // ----- foreground service and notification -----
  const liveSince = useRef(0);
  useEffect(() => {
    liveSince.current = clockStart(stage, latest.current.seconds);
  }, [stage]);

  const live = hasMedia && !ended;
  const info = callNotificationInfo({ kind, type, name, stage });
  useEffect(() => {
    if (!live) return;
    showCallService({ title: info.title, text: info.text, startedAt: liveSince.current, route: info.route });
  }, [live, info.title, info.text, info.route, stage]);
  useEffect(() => {
    if (!live) return;
    return () => {
      stopCallService();
    };
  }, [live]);

  // ----- "End call" on the notification -----
  useEffect(() => {
    consumeEndRequest(); // drop a request left over from an earlier call
    return onEndCallRequested(() => latest.current.hangUp());
  }, []);

  // ----- camera follows the app -----
  const autoOff = useRef(false);
  const isVideo = type === 'video';
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const current = latest.current;
      // "End call" pressed while nothing was listening.
      if (state === 'active' && consumeEndRequest()) {
        current.hangUp();
        return;
      }
      const action = cameraAction({ appState: state, isVideo, cameraOff: current.cameraOff, autoOff: autoOff.current });
      if (action === 'off') {
        autoOff.current = true;
        current.toggleCamera();
      } else if (action === 'on') {
        autoOff.current = false;
        current.toggleCamera();
      } else if (state === 'active') {
        autoOff.current = false;
      }
    });
    return () => subscription.remove();
  }, [isVideo]);
}

function useMe() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const username = currentUser?.username;
  const me = useMemo(() => (uid && username ? { uid, username } : null), [uid, username]);
  return { me, uid };
}

function DirectCallHost({ call }: { call: ActiveDirectCall }) {
  const { me, uid } = useMe();
  const session = useCallSession({ callId: call.callId, outgoing: call.outgoing, me });
  const { phase } = session;
  const other = session.call
    ? session.call.callerId === uid
      ? session.call.calleeName
      : session.call.callerName
    : '';

  useBackgroundCall({
    callKey: call.key,
    kind: 'direct',
    session,
    type: call.outgoing?.type ?? session.call?.type ?? 'audio',
    name: call.outgoing ? call.outgoing.callee.username : other,
    stage: phase === 'connected' ? 'live' : phase === 'ringing' ? 'ringing' : 'starting',
    seconds: session.seconds,
    hasMedia: !!session.localStream,
    ended: phase === 'ended',
    cameraOff: session.cameraOff,
    hangUp: session.hangUp,
    toggleCamera: session.toggleCamera,
  });
  return null;
}

function GroupCallHost({ call }: { call: ActiveGroupCall }) {
  const { me } = useMe();
  const { getConversation } = useConversations();
  const conversation = getConversation(call.conversationId);
  const session = useGroupCallSession({
    conversationId: call.conversationId,
    conversation,
    callId: call.callId,
    type: call.type,
    me,
  });

  useBackgroundCall({
    callKey: call.key,
    kind: 'group',
    session,
    type: session.callType,
    name: conversation?.groupName || 'Group call',
    stage: session.phase === 'in-call' ? 'live' : 'starting',
    seconds: session.seconds,
    hasMedia: !!session.localStream,
    ended: session.phase === 'ended',
    cameraOff: session.cameraOff,
    hangUp: session.hangUp,
    toggleCamera: session.toggleCamera,
  });
  return null;
}

export function ActiveCallProvider({ children }: { children: React.ReactNode }) {
  const active = useActiveCall();
  const { isLoading, firebaseUser } = useAuth();

  // Signing out ends the call.
  useEffect(() => {
    if (!isLoading && !firebaseUser) releaseCall();
  }, [isLoading, firebaseUser]);

  // `children` stays first and keeps its place, so the app below is never remounted when a call starts or ends.
  return (
    <>
      {children}
      {active?.kind === 'direct' && <DirectCallHost key={active.key} call={active} />}
      {active?.kind === 'group' && <GroupCallHost key={active.key} call={active} />}
      {active && <ReturnToCallBubble />}
    </>
  );
}
