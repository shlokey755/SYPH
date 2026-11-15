/**
 * group-call/[id].web.tsx
 * The group call screen in a browser (FR-06, group calls). The logic is that of group-call/[id].tsx; what is drawn is the pirate
 * map: the name of the group in blackletter, the time under it, everyone (yourself included) in a wooden frame of the same size,
 * and the buttons on a plank along the bottom. The frames are laid out for the shape of the window (utils/tileGrid.ts): side by side
 * in a wide one, stacked in a tall one.
 * A browser has no floating bubble to come back from, so "Chats" leaves the call running and the way back is in the page: a button
 * in the rail on a wide window, a strip across the top anywhere else (components/desktop/OnCallChip.tsx). A computer has no
 * earpiece and one camera, so the buttons for the sound route and for turning the camera over are left out. A phone never loads
 * this file. When group-call/[id].tsx changes how a call starts, runs or ends, change it here too.
 */

import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { ControlButton } from '../../components/call/ControlButton';
import { ParticipantTile } from '../../components/call/ParticipantTile';
import { CallPlank } from '../../components/call/CallPlank';
import { buttonInk, MapButton, Page, RoundButton, roundLook, Text } from '../../components/parchment';
import { useTheme } from '../../theme/mapTheme';
import { useAuth } from '../../hooks/useAuth';
import { useConversations } from '../../hooks/useConversations';
import { getActiveCall, GroupSession, releaseCall, startCall, useActiveCall, useGroupSession } from '../../services/activeCallStore';
import { CallType } from '../../types';
import { formatCallClock } from '../../utils/call';
import { ACTIVE_CALL_ID, CALL_ROUTE } from '../../utils/callBackground';
import { groupEndReasonText, participantCountLabel, tileMode } from '../../utils/groupCall';
import { bestGrid } from '../../utils/tileGrid';

/** How long the "You left the call" line stays up before the screen closes by itself. */
const CLOSE_DELAY_MS = 1500;

export default function GroupCallScreen() {
  const params = useLocalSearchParams<{ id: string; conversationId?: string; type?: string }>();
  const router = useRouter();
  const active = useActiveCall();
  const session = useGroupSession();

  const isNew = params.id === 'new';
  const isAttach = params.id === ACTIVE_CALL_ID;
  const conversationId = params.conversationId;
  const requestedType: CallType = params.type === 'video' ? 'video' : 'audio';

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
      else if (running.kind !== 'group') router.replace(CALL_ROUTE[running.kind]);
      return;
    }
    if (!conversationId) {
      goBack();
      return;
    }
    const outcome = startCall({
      kind: 'group',
      callId: isNew ? null : params.id,
      conversationId,
      type: requestedType,
    });
    if (outcome === 'busy') router.replace(CALL_ROUTE[getActiveCall()?.kind ?? 'group']);
  }, [isAttach, isNew, params.id, conversationId, requestedType, goBack, router]);

  // Closing after the call has ended lets go of it. (Going back mid-call does not.)
  const close = useCallback(() => {
    releaseCall();
    goBack();
  }, [goBack]);

  // Until the host has published the call (a moment after opening) there is nothing to draw.
  if (!session || active?.kind !== 'group') {
    return <Page variant="map" />;
  }
  return (
    <GroupCallView
      session={session}
      conversationId={active.conversationId}
      isNew={active.callId === null}
      onClose={close}
      onMinimize={goBack}
    />
  );
}

function GroupCallView({
  session,
  conversationId,
  isNew,
  onClose,
  onMinimize,
}: {
  session: GroupSession;
  conversationId: string;
  /** True when this device started the call, false when it joined one. */
  isNew: boolean;
  onClose: () => void;
  onMinimize: () => void;
}) {
  const { themeColors: c } = useTheme();
  const { currentUser } = useAuth();
  const { getConversation } = useConversations();
  const conversation = getConversation(conversationId);
  const { phase } = session;
  const isVideo = session.callType === 'video';

  useKeepAwake();

  useEffect(() => {
    if (phase !== 'ended') return;
    const timer = setTimeout(onClose, CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase, onClose]);

  // ----- grid -----
  const [grid, setGrid] = useState({ width: 0, height: 0 });
  const onGridLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setGrid((previous) => (previous.width === width && previous.height === height ? previous : { width, height }));
  };

  const others = session.participants;
  const tileCount = others.length + 1; // yourself included
  const { width: tileWidth, height: tileHeight } = bestGrid(tileCount, grid.width, grid.height);

  const hasVideo = (stream: { getVideoTracks: () => unknown[] } | null) => !!stream && stream.getVideoTracks().length > 0;

  let status: string;
  if (phase === 'ended') status = session.endReason ? groupEndReasonText(session.endReason) : 'Call ended';
  else if (phase === 'preparing') status = isNew ? 'Starting…' : 'Joining…';
  else if (others.length === 0) status = `Waiting for others · ${formatCallClock(session.seconds)}`;
  else status = `${participantCountLabel(others.length + 1)} · ${formatCallClock(session.seconds)}`;

  const title = conversation?.groupName || 'Group call';
  const ended = phase === 'ended';

  return (
    <Page variant="map">
      <View style={styles.body}>
        <View style={styles.column}>
          <View style={styles.header}>
            <View style={styles.side}>
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
            <View style={styles.headings}>
              <Text kind="display" numberOfLines={1} style={[styles.title, { color: c.ink }]}>
                {title}
              </Text>
              <Text kind="hand" accessibilityLiveRegion="polite" style={[styles.status, { color: c.inkSoft }]}>
                {status}
              </Text>
            </View>
            <View style={styles.side} />
          </View>

          <View style={styles.grid} onLayout={onGridLayout}>
            {!ended && grid.width > 0 && (
              <View style={styles.tiles}>
                {others.map((person) => (
                  <ParticipantTile
                    key={person.uid}
                    name={person.username}
                    stream={person.stream}
                    mode={tileMode({ isVideoCall: isVideo, hasVideo: hasVideo(person.stream), cameraOff: person.cameraOff })}
                    muted={person.muted}
                    caption={person.state === 'connecting' ? 'Connecting…' : person.state === 'failed' ? "Can't connect" : ''}
                    width={tileWidth}
                    height={tileHeight}
                  />
                ))}
                <ParticipantTile
                  name={`${currentUser?.username ?? 'You'} (You)`}
                  stream={session.localStream}
                  mode={tileMode({ isVideoCall: isVideo, hasVideo: hasVideo(session.localStream), cameraOff: session.cameraOff })}
                  muted={session.muted}
                  mirror={session.frontCamera}
                  width={tileWidth}
                  height={tileHeight}
                />
              </View>
            )}
          </View>
        </View>
      </View>

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
            <RoundButton tone="wax" size={64} onPress={session.hangUp} accessibilityLabel="Leave call">
              <Ionicons name="call" size={28} color={roundLook(c, 'wax').ink} style={styles.hangUpIcon} />
            </RoundButton>
          </>
        )}
      </CallPlank>
    </Page>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  column: { flex: 1, width: '100%', maxWidth: 1100 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 64, paddingBottom: 8 },
  side: { width: 110, alignItems: 'flex-start' },
  headings: { flex: 1, minWidth: 0, alignItems: 'center' },
  title: { fontSize: 34, lineHeight: 40, maxWidth: '100%', textAlign: 'center' },
  status: { fontSize: 20, lineHeight: 24, textAlign: 'center' },
  grid: { flex: 1 },
  // A last row with fewer frames sits in the middle, and the whole group in the middle of the space.
  tiles: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center' },
  // The phone glyph points up-right; turned over it reads as "hang up".
  hangUpIcon: { transform: [{ rotate: '135deg' }] },
});
