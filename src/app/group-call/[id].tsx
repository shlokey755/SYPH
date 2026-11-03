/**
 * group-call/[id].tsx
 * The group call screen (FR-06, group calls). One person starts it, the others join from the chat.
 *
 *   /group-call/new?conversationId=…&type=audio|video     start a call in this group
 *   /group-call/<callId>?conversationId=…&type=…          join the call that is in progress
 *   /group-call/active                                    show the call that is already running
 *
 * Media and signalling live in useGroupCallSession, which runs in the app-level host (components/call/ActiveCallHost.tsx),
 * not here: this file asks for the call when it opens and then only draws the state. Everyone, yourself included, gets an
 * equal tile. Going back leaves the call running (the bubble and the notification bring you back); only the leave button
 * ends it for you (the others carry on).
 */

import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ControlButton } from '../../components/call/ControlButton';
import { ParticipantTile } from '../../components/call/ParticipantTile';
import { useTheme } from '../../hooks/themeContext';
import { useAuth } from '../../hooks/useAuth';
import { useConversations } from '../../hooks/useConversations';
import { getActiveCall, GroupSession, releaseCall, startCall, useActiveCall, useGroupSession } from '../../services/activeCallStore';
import { CallType } from '../../types';
import { routeIcon, routeLabel } from '../../utils/audioRoute';
import { formatCallClock } from '../../utils/call';
import { ACTIVE_CALL_ID, CALL_ROUTE } from '../../utils/callBackground';
import { groupEndReasonText, gridLayout, participantCountLabel, tileMode } from '../../utils/groupCall';

/** How long the "You left the call" line stays up before the screen closes by itself. */
const CLOSE_DELAY_MS = 1500;

export default function GroupCallScreen() {
  const params = useLocalSearchParams<{ id: string; conversationId?: string; type?: string }>();
  const router = useRouter();
  const { themeColors } = useTheme();
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
    return <View style={[styles.container, { backgroundColor: themeColors.background }]} />;
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
  const insets = useSafeAreaInsets();
  const { themeColors } = useTheme();
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
  const { columns, rows } = gridLayout(tileCount);
  const tileWidth = Math.floor(grid.width / columns);
  const tileHeight = Math.floor(grid.height / rows);

  const hasVideo = (stream: { getVideoTracks: () => unknown[] } | null) => !!stream && stream.getVideoTracks().length > 0;

  let status: string;
  if (phase === 'ended') status = session.endReason ? groupEndReasonText(session.endReason) : 'Call ended';
  else if (phase === 'preparing') status = isNew ? 'Starting…' : 'Joining…';
  else if (others.length === 0) status = `Waiting for others · ${formatCallClock(session.seconds)}`;
  else status = `${participantCountLabel(others.length + 1)} · ${formatCallClock(session.seconds)}`;

  const title = conversation?.groupName || 'Group call';
  const ended = phase === 'ended';

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {!ended && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Minimise call"
          onPress={onMinimize}
          hitSlop={8}
          style={[styles.minimize, { top: insets.top + 8 }]}
        >
          <Ionicons name="chevron-down" size={30} color={themeColors.text} />
        </Pressable>
      )}

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={[styles.title, { color: themeColors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.status, { color: themeColors.subText }]} accessibilityLiveRegion="polite">
          {status}
        </Text>
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

      <View style={[styles.controls, { paddingBottom: insets.bottom + 20 }]}>
        {ended ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={[styles.pill, { backgroundColor: themeColors.accent }]}
          >
            <Text style={[styles.pillText, { color: themeColors.buttonText }]}>Close</Text>
          </Pressable>
        ) : (
          <>
            <ControlButton
              icon={session.muted ? 'mic-off' : 'mic'}
              label={session.muted ? 'Unmute' : 'Mute'}
              active={session.muted}
              onPress={session.toggleMute}
            />
            <ControlButton
              icon={routeIcon(session.audioRoute)}
              label={`Sound: ${routeLabel(session.audioRoute)}. Tap to switch`}
              active={session.audioRoute !== 'earpiece'}
              onPress={session.toggleSpeaker}
            />
            {isVideo && (
              <>
                <ControlButton
                  icon={session.cameraOff ? 'videocam-off' : 'videocam'}
                  label={session.cameraOff ? 'Turn camera on' : 'Turn camera off'}
                  active={session.cameraOff}
                  onPress={session.toggleCamera}
                />
                <ControlButton icon="camera-reverse" label="Switch camera" onPress={session.switchCamera} />
              </>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Leave call"
              onPress={session.hangUp}
              style={[styles.round, { backgroundColor: themeColors.danger }]}
            >
              <Ionicons name="call" size={26} color="#FFFFFF" style={styles.hangUpIcon} />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  minimize: { position: 'absolute', left: 8, width: 48, height: 48, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  header: { alignItems: 'center', gap: 4, paddingHorizontal: 24, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '600', maxWidth: 320 },
  status: { fontSize: 14 },
  grid: { flex: 1, paddingHorizontal: 4 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap' },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap', // very narrow screens wrap onto a second row instead of clipping
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  round: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  // The phone glyph points up-right; turned over it reads as "hang up".
  hangUpIcon: { transform: [{ rotate: '135deg' }] },
  pill: { paddingHorizontal: 36, paddingVertical: 14, borderRadius: 28 },
  pillText: { fontSize: 16, fontWeight: '600' },
});
