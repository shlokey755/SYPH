/**
 * call/[id].web.tsx
 * The call screen in a browser (FR-06), for both directions. The logic is that of call/[id].tsx; what is drawn is the pirate map.
 * A voice call is a parchment note with the other person's face, name and the time. A video call is their picture in a wooden
 * frame with a nameplate, and your own in a small frame beside it. The buttons lie on a plank along the bottom.
 * A browser has no floating bubble to come back from (tabs and windows do that), so "Chats" leaves the call running and the way back
 * is in the page: a button in the rail on a wide window, a strip across the top anywhere else (components/desktop/OnCallChip.tsx).
 * A computer has no earpiece and one camera, so the buttons for the sound route and for turning the camera over are left out.
 * A phone never loads this file. When call/[id].tsx changes how a call starts, runs or ends, change it here too.
 */


import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AddPeopleSheet } from '../../components/call/AddPeopleSheet';
import { ControlButton } from '../../components/call/ControlButton';
import { CallPlank } from '../../components/call/CallPlank';
import { Avatar, buttonInk, MapButton, Page, Paper, RoundButton, roundLook, Text } from '../../components/parchment';
import { useTheme } from '../../theme/mapTheme';
import { withAlpha } from '../../theme/parchment';
import { useAuth } from '../../hooks/useAuth';
import { getActiveCall, releaseCall, startCall, useActiveCall, useDirectSession, DirectSession } from '../../services/activeCallStore';
import { createGroupConversation } from '../../services/chatService';
import { getWebRTC } from '../../services/webrtc';
import { CallType } from '../../types';
import { callTiles, endReasonText, formatCallClock, muteIndicator } from '../../utils/call';
import { ACTIVE_CALL_ID, CALL_ROUTE } from '../../utils/callBackground';
import { Candidate, maxAddable, upgradeGroupName } from '../../utils/callUpgrade';
import { MAX_PARTICIPANTS } from '../../utils/groupCall';
import type { OutgoingCall } from '../../hooks/useCallSession';

/** How long the "Call ended" line stays up before the screen closes by itself. */
const CLOSE_DELAY_MS = 1800;

/** How long to wait for the new group chat to be saved before telling the person it did not work. */
const CREATE_GROUP_TIMEOUT_MS = 10_000;

export default function CallScreen() {
  const params = useLocalSearchParams<{
    id: string;
    conversationId?: string;
    type?: string;
    calleeId?: string;
    calleeName?: string;
  }>();
  const router = useRouter();
  const active = useActiveCall();
  const session = useDirectSession();

  const isNew = params.id === 'new';
  const isAttach = params.id === ACTIVE_CALL_ID;

  const requested = useMemo<OutgoingCall | undefined>(() => {
    if (!isNew || !params.conversationId || !params.calleeId) return undefined;
    return {
      conversationId: params.conversationId,
      type: (params.type === 'video' ? 'video' : 'audio') as CallType,
      callee: { uid: params.calleeId, username: params.calleeName ?? 'Unknown' },
    };
  }, [isNew, params.conversationId, params.type, params.calleeId, params.calleeName]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  // Opening this screen asks the app-level host for the call, once. If a different call is already running, that one is
  // shown instead (one call at a time).
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    const running = getActiveCall();
    if (isAttach) {
      if (!running) goBack();
      else if (running.kind !== 'direct') router.replace(CALL_ROUTE[running.kind]);
      return;
    }
    const outcome = startCall({ kind: 'direct', callId: isNew ? null : params.id, outgoing: requested });
    if (outcome === 'busy') router.replace(CALL_ROUTE[getActiveCall()?.kind ?? 'direct']);
  }, [isAttach, isNew, params.id, requested, goBack, router]);

  // "Add people" moves this call into a group call: follow it to the group call screen.
  const kind = active?.kind;
  const wasDirect = useRef(false);
  useEffect(() => {
    if (kind === 'direct') wasDirect.current = true;
    else if (kind === 'group' && wasDirect.current) {
      wasDirect.current = false;
      router.replace(CALL_ROUTE.group);
    }
  }, [kind, router]);

  // Closing after the call has ended lets go of it. (Going back mid-call does not.)
  const close = useCallback(() => {
    releaseCall();
    goBack();
  }, [goBack]);

  // Until the host has published the call (a moment after opening) there is nothing to draw.
  if (!session || active?.kind !== 'direct') {
    return <Page variant="map" />;
  }
  return <DirectCallView session={session} outgoing={active.outgoing} onClose={close} onMinimize={goBack} />;
}

function DirectCallView({
  session,
  outgoing,
  onClose,
  onMinimize,
}: {
  session: DirectSession;
  outgoing: OutgoingCall | undefined;
  onClose: () => void;
  onMinimize: () => void;
}) {
  const { themeColors: c } = useTheme();
  const { currentUser } = useAuth();
  const { phase, call } = session;
  const [adding, setAdding] = useState(false);

  useKeepAwake();

  useEffect(() => {
    if (phase !== 'ended') return;
    const timer = setTimeout(onClose, CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase, onClose]);

  const type: CallType = outgoing?.type ?? call?.type ?? 'audio';
  const isVideo = type === 'video';
  const otherName = outgoing
    ? outgoing.callee.username
    : call
      ? call.callerId === currentUser?.uid
        ? call.calleeName
        : call.callerName
      : '';

  // "Add people": make a group chat with everyone, then move the call into it (both phones follow).
  const otherUid = outgoing
    ? outgoing.callee.uid
    : call
      ? call.callerId === currentUser?.uid
        ? call.calleeId
        : call.callerId
      : '';
  const canAdd = phase === 'connected' && !session.reconnecting && !!currentUser && !!otherUid;
  const addLimit = maxAddable(MAX_PARTICIPANTS[type]);
  const { moveToGroup } = session;
  const addPeople = useCallback(
    async (people: Candidate[]) => {
      if (!currentUser) throw new Error('not signed in');
      const me = { uid: currentUser.uid, username: currentUser.username };
      const other = { uid: otherUid, username: otherName };
      const name = upgradeGroupName([me.username, other.username, ...people.map((p) => p.username)]);
      const created = createGroupConversation(me, [other, ...people], name);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const conversationId = await Promise.race([
        created,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), CREATE_GROUP_TIMEOUT_MS);
        }),
      ]).finally(() => timer && clearTimeout(timer));
      await moveToGroup(conversationId);
    },
    [currentUser, otherUid, otherName, moveToGroup]
  );

  let status: string;
  if (phase === 'ended') status = endReasonText(session.endReason ?? 'ended', session.isCaller);
  else if (session.reconnecting) status = 'Reconnecting…';
  else if (phase === 'connected') status = formatCallClock(session.seconds);
  else if (phase === 'ringing') status = 'Ringing…';
  else if (phase === 'connecting') status = 'Connecting…';
  else status = session.isCaller ? 'Calling…' : 'Answering…';

  const RTCView = getWebRTC()?.RTCView;
  const ended = phase === 'ended';
  // A camera that is switched off must not leave its last frame on screen: show an opaque panel with the name instead.
  const tiles = callTiles({
    isVideo,
    ended,
    hasLocalStream: !!session.localStream,
    cameraOff: session.cameraOff,
    hasRemoteVideo: !!session.remoteStream && session.remoteStream.getVideoTracks().length > 0,
    remoteCameraOff: session.remoteCameraOff,
  });
  const remoteHasVideo = tiles.remote === 'video';
  const remoteCameraOff = isVideo && !ended && session.remoteCameraOff;
  // Muted icon: over the corner of their video when it is showing, otherwise on their profile panel.
  const mute = muteIndicator({ remoteMuted: session.remoteMuted, ended, remoteTile: tiles.remote });
  const showVideo = remoteHasVideo && !ended;

  return (
    <Page variant="map">
      <View style={styles.body}>
        <View style={styles.column}>
          <View style={styles.top}>
            {!ended ? (
              <MapButton
                variant="ghost"
                small
                title="Chats"
                accessibilityLabel="Minimise call"
                icon={<Ionicons name="chevron-back" size={18} color={buttonInk(c, 'ghost')} />}
                onPress={onMinimize}
              />
            ) : null}
          </View>

          <View style={styles.stage}>
            {showVideo ? (
              <View style={[styles.frame, { borderColor: c.wood, backgroundColor: c.burn }]}>
                {RTCView ? (
                  <RTCView streamURL={session.remoteStream!.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" zOrder={0} />
                ) : null}
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 1, borderColor: withAlpha(c.brass, 0.9) }]} />
                <View style={[styles.nameplate, { backgroundColor: withAlpha(c.wood, 0.92) }]}>
                  {mute === 'corner' ? (
                    <View accessibilityLabel={`${otherName} is muted`}>
                      <Ionicons name="mic-off" size={20} color={c.gilt} />
                    </View>
                  ) : null}
                  <View style={styles.plateText}>
                    <Text kind="display" numberOfLines={1} style={[styles.plateName, { color: c.gilt }]}>
                      {otherName}
                    </Text>
                    <Text kind="hand" accessibilityLiveRegion="polite" style={[styles.plateStatus, { color: c.buttonText }]}>
                      {status}
                    </Text>
                  </View>
                  {canAdd ? (
                    <RoundButton tone="wood" size={42} onPress={() => setAdding(true)} accessibilityLabel="Add people to this call">
                      <Ionicons name="person-add" size={19} color={roundLook(c, 'wood').ink} />
                    </RoundButton>
                  ) : null}
                </View>
              </View>
            ) : (
              <Paper torn="both" pin="tack" angle={-0.6} style={styles.card} contentStyle={styles.cardBody}>
                <Text kind="label" style={[styles.kind, { color: c.inkSoft }]}>
                  {isVideo ? 'Video call' : 'Voice call'}
                </Text>
                <View>
                  <Avatar name={otherName || '?'} size={128} />
                  {mute === 'panel' ? (
                    <View
                      style={[styles.avatarBadge, { backgroundColor: c.stamp, borderColor: c.paper }]}
                      accessibilityLabel={`${otherName} is muted`}
                    >
                      <Ionicons name="mic-off" size={18} color={c.buttonText} />
                    </View>
                  ) : null}
                </View>
                <Text kind="display" numberOfLines={1} style={[styles.name, { color: c.ink }]}>
                  {otherName}
                </Text>
                <Text kind="hand" accessibilityLiveRegion="polite" style={[styles.status, { color: c.inkSoft }]}>
                  {status}
                </Text>
                {remoteCameraOff ? (
                  <View style={styles.cameraOffRow}>
                    <Ionicons name="videocam-off" size={16} color={c.inkSoft} />
                    <Text kind="body" style={[styles.cameraOffText, { color: c.inkSoft }]}>
                      Camera off
                    </Text>
                  </View>
                ) : null}
                {canAdd ? (
                  <MapButton
                    variant="ghost"
                    small
                    title="Add people"
                    accessibilityLabel="Add people to this call"
                    icon={<Ionicons name="person-add" size={16} color={buttonInk(c, 'ghost')} />}
                    onPress={() => setAdding(true)}
                  />
                ) : null}
              </Paper>
            )}

            {RTCView && tiles.local === 'video' ? (
              <View style={[styles.pip, { borderColor: c.paper, backgroundColor: c.burn }]}>
                <RTCView
                  streamURL={session.localStream!.toURL()}
                  style={StyleSheet.absoluteFill}
                  objectFit="cover"
                  mirror={session.frontCamera}
                  zOrder={1}
                />
              </View>
            ) : null}

            {/* Own camera off: a parchment tile with my username instead of a frozen frame or an empty gap. */}
            {tiles.local === 'panel' ? (
              <View
                style={[styles.pip, styles.pipOff, { borderColor: c.paper, backgroundColor: c.paperAlt }]}
                accessibilityLabel="Your camera is off"
              >
                <Ionicons name="videocam-off" size={22} color={c.inkSoft} />
                <Text kind="label" numberOfLines={2} style={[styles.pipName, { color: c.ink }]}>
                  {currentUser?.username ?? ''}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <AddPeopleSheet
        visible={adding && canAdd}
        onClose={() => setAdding(false)}
        limit={addLimit}
        excludeUids={[otherUid]}
        onConfirm={addPeople}
      />

      <CallPlank>
        {ended ? (
          <MapButton variant="wax" title="Close" onPress={onClose} />
        ) : (
          <>
            <ControlButton
              icon={session.muted ? 'mic-off' : 'mic'}
              label={session.muted ? 'Unmute' : 'Mute'}
              active={session.muted}
              onPress={session.toggleMute}
            />
            {isVideo && (
              <ControlButton
                icon={session.cameraOff ? 'videocam-off' : 'videocam'}
                label={session.cameraOff ? 'Turn camera on' : 'Turn camera off'}
                active={session.cameraOff}
                onPress={session.toggleCamera}
              />
            )}
            <RoundButton tone="wax" size={64} onPress={session.hangUp} accessibilityLabel="Hang up">
              <Ionicons name="call" size={28} color={roundLook(c, 'wax').ink} style={styles.hangUpIcon} />
            </RoundButton>
          </>
        )}
      </CallPlank>
    </Page>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  column: { flex: 1, width: '100%', maxWidth: 980 },
  top: { minHeight: 40, alignItems: 'flex-start', justifyContent: 'center', marginBottom: 8 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 460 },
  cardBody: { alignItems: 'center', gap: 10, paddingHorizontal: 28, paddingTop: 30, paddingBottom: 28 },
  kind: { fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' },
  name: { fontSize: 42, lineHeight: 48, maxWidth: '100%', textAlign: 'center' },
  status: { fontSize: 22, lineHeight: 26, textAlign: 'center' },
  avatarBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraOffRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cameraOffText: { fontSize: 16 },
  frame: { flex: 1, alignSelf: 'stretch', borderWidth: 6, borderRadius: 4, overflow: 'hidden' },
  nameplate: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
  },
  plateText: { flex: 1, minWidth: 0 },
  plateName: { fontSize: 26, lineHeight: 30 },
  plateStatus: { fontSize: 17, lineHeight: 20 },
  pip: { position: 'absolute', top: 8, right: 8, width: 150, height: 112, borderWidth: 3, overflow: 'hidden' },
  pipOff: { alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6 },
  pipName: { fontSize: 13, textAlign: 'center' },
  // The phone glyph points up-right; turned over it reads as "hang up".
  hangUpIcon: { transform: [{ rotate: '135deg' }] },
});
