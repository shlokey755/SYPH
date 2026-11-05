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
 *
 * "Add people" ends a 1-to-1 call with `movedTo` set; the direct host then hands over to a group call in that chat. The
 * foreground service is kept running through that hand-over (Android 12+ refuses to start it from the background).
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
  startCall,
  unpublishSession,
  useActiveCall,
} from '../../services/activeCallStore';
import { feelCall } from '../../services/alertSounds';
import { startRingback, stopRingback } from '../../services/callAudio';
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
  /** The group chat a 1-to-1 call is carrying on in; the service stays up while it is set. */
  movedTo?: string | null;
  cameraOff: boolean;
  hangUp: () => void;
  toggleCamera: () => void;
}

/** Everything a host does besides running the call itself. */
function useBackgroundCall(input: HostInput) {
  const { setOnCall } = useIncomingCalls();
  const { callKey, session, kind, type, name, stage, hasMedia, ended, movedTo } = input;

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

  // A call that moves on to a group call keeps the service: it is still the same person on the same microphone.
  const live = movedTo ? true : hasMedia && !ended;
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
  // Whichever way this host goes away, the service goes with it, except when the next host is taking over.
  useEffect(
    () => () => {
      if (!latest.current.movedTo) stopCallService();
    },
    []
  );

  // ----- how the call feels: one pulse when it connects, two short ones when it ends -----
  const isLive = stage === 'live';
  useEffect(() => {
    if (isLive) feelCall('connected');
  }, [isLive]);
  useEffect(() => {
    // Not when the call is only moving into a group call: the person is still on it.
    if (ended && !latest.current.movedTo) feelCall('ended');
  }, [ended]);

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
  const { expectGroupCall } = useIncomingCalls();
  const session = useCallSession({ callId: call.callId, outgoing: call.outgoing, me });
  const { phase, movedTo } = session;
  const other = session.call
    ? session.call.callerId === uid
      ? session.call.calleeName
      : session.call.callerName
    : '';

  const type = call.outgoing?.type ?? session.call?.type ?? 'audio';

  // The caller hears the "tu-tu" while the other phone rings, and not once it is answered or given up.
  const waitingForAnswer = !!call.outgoing && phase === 'ringing';
  useEffect(() => {
    if (!waitingForAnswer) return;
    startRingback();
    return () => {
      stopRingback();
    };
  }, [waitingForAnswer]);

  useBackgroundCall({
    callKey: call.key,
    kind: 'direct',
    session,
    type,
    name: call.outgoing ? call.outgoing.callee.username : other,
    stage: phase === 'connected' ? 'live' : phase === 'ringing' ? 'ringing' : 'starting',
    seconds: session.seconds,
    hasMedia: !!session.localStream,
    ended: phase === 'ended',
    movedTo,
    cameraOff: session.cameraOff,
    hangUp: session.hangUp,
    toggleCamera: session.toggleCamera,
  });

  // "Add people": the call moved into a group chat, so carry on there (after useBackgroundCall, so its latest-values
  // effect has already run when this host unmounts and the service is deliberately left alone). Both phones do this: the first to start the
  // group call marks the chat "in a call" and the other joins it. This phone is not rung for it.
  useEffect(() => {
    if (!movedTo) return;
    expectGroupCall(movedTo);
    releaseCall(call.key);
    startCall({ kind: 'group', callId: null, conversationId: movedTo, type });
    // Runs once, when `movedTo` appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movedTo]);
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
