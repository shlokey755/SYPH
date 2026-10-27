/**
 * group-call/[id].tsx
 * The group call screen (FR-06, group calls). One person starts it, the others join from the chat.
 *
 *   /group-call/new?conversationId=…&type=audio|video     start a call in this group
 *   /group-call/<callId>?conversationId=…&type=…          join the call that is in progress
 *
 * Media and signalling live in useGroupCallSession; this file only draws the state. Everyone, yourself included, gets an
 * equal tile. Leaving the screen leaves the call (the others carry on).
 */

import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ControlButton } from '../../components/call/ControlButton';
import { ParticipantTile } from '../../components/call/ParticipantTile';
import { useTheme } from '../../hooks/themeContext';
import { useAuth } from '../../hooks/useAuth';
import { useConversations } from '../../hooks/useConversations';
import { useGroupCallSession } from '../../hooks/useGroupCallSession';
import { useIncomingCalls } from '../../hooks/useIncomingCalls';
import { CallType } from '../../types';
import { formatCallClock } from '../../utils/call';
import { groupEndReasonText, gridLayout, participantCountLabel, tileMode } from '../../utils/groupCall';

/** How long the "You left the call" line stays up before the screen closes by itself. */
const CLOSE_DELAY_MS = 1500;

export default function GroupCallScreen() {
  const params = useLocalSearchParams<{ id: string; conversationId?: string; type?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { themeColors } = useTheme();
  const { currentUser } = useAuth();
  const { setOnCall } = useIncomingCalls();
  const { getConversation } = useConversations();

  useKeepAwake();

  const isNew = params.id === 'new';
  const conversationId = params.conversationId;
  const conversation = conversationId ? getConversation(conversationId) : undefined;
  const requestedType: CallType = params.type === 'video' ? 'video' : 'audio';

  const me = useMemo(
    () => (currentUser ? { uid: currentUser.uid, username: currentUser.username } : null),
    [currentUser]
  );

  const session = useGroupCallSession({
    conversationId,
    conversation,
    callId: isNew ? null : params.id,
    type: requestedType,
    me,
  });
  const { phase } = session;
  const isVideo = session.callType === 'video';

  // Tell the incoming-call provider this device is busy for as long as the screen is open.
  useEffect(() => {
    setOnCall(true);
    return () => setOnCall(false);
  }, [setOnCall]);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  useEffect(() => {
    if (phase !== 'ended') return;
    const timer = setTimeout(close, CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase, close]);

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
            onPress={close}
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
              icon={session.speakerOn ? 'volume-high' : 'ear'}
              label={session.speakerOn ? 'Switch to earpiece' : 'Switch to speaker'}
              active={session.speakerOn}
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
