/**
 * call/[id].tsx
 * The call screen (FR-06), for both directions.
 *
 *   /call/new?conversationId=…&type=audio|video&calleeId=…&calleeName=…   place a call
 *   /call/<callId>                                                       answer a call that is ringing for you
 *
 * Media and signalling live in useCallSession; this file only draws the state. Leaving the screen hangs up.
 */

import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ControlButton } from '../../components/call/ControlButton';
import { useTheme } from '../../hooks/themeContext';
import { useAuth } from '../../hooks/useAuth';
import { useCallSession } from '../../hooks/useCallSession';
import { useIncomingCalls } from '../../hooks/useIncomingCalls';
import { getWebRTC } from '../../services/webrtc';
import { CallType } from '../../types';
import { routeIcon, routeLabel } from '../../utils/audioRoute';
import { callTiles, endReasonText, formatCallClock, muteIndicator } from '../../utils/call';

/** How long the "Call ended" line stays up before the screen closes by itself. */
const CLOSE_DELAY_MS = 1800;

export default function CallScreen() {
  const params = useLocalSearchParams<{
    id: string;
    conversationId?: string;
    type?: string;
    calleeId?: string;
    calleeName?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { themeColors } = useTheme();
  const { currentUser } = useAuth();
  const { setOnCall } = useIncomingCalls();

  useKeepAwake();

  const isNew = params.id === 'new';
  const me = useMemo(
    () => (currentUser ? { uid: currentUser.uid, username: currentUser.username } : null),
    [currentUser]
  );

  const outgoing = useMemo(() => {
    if (!isNew || !params.conversationId || !params.calleeId) return undefined;
    return {
      conversationId: params.conversationId,
      type: (params.type === 'video' ? 'video' : 'audio') as CallType,
      callee: { uid: params.calleeId, username: params.calleeName ?? 'Unknown' },
    };
  }, [isNew, params.conversationId, params.type, params.calleeId, params.calleeName]);

  const session = useCallSession({ callId: isNew ? null : params.id, outgoing, me });
  const { phase, call } = session;

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

  const type: CallType = outgoing?.type ?? call?.type ?? 'audio';
  const isVideo = type === 'video';
  const otherName = outgoing
    ? outgoing.callee.username
    : call
      ? call.callerId === currentUser?.uid
        ? call.calleeName
        : call.callerName
      : '';

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

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {RTCView && remoteHasVideo && !ended && (
        <RTCView
          streamURL={session.remoteStream!.toURL()}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
          zOrder={0}
        />
      )}

      <View style={[styles.top, { paddingTop: insets.top + 32 }]}>
        {!(remoteHasVideo && !ended) && (
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.accent }]}>
              <Text style={[styles.initial, { color: themeColors.accent }]}>
                {(otherName || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            {mute === 'panel' && (
              <View
                style={[styles.avatarBadge, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}
                accessibilityLabel={`${otherName} is muted`}
              >
                <Ionicons name="mic-off" size={18} color={themeColors.text} />
              </View>
            )}
          </View>
        )}
        <Text style={[styles.name, { color: themeColors.text }, remoteHasVideo && !ended && styles.overVideo]} numberOfLines={1}>
          {otherName}
        </Text>
        <Text
          style={[styles.status, { color: themeColors.subText }, remoteHasVideo && !ended && styles.overVideo]}
          accessibilityLiveRegion="polite"
        >
          {status}
        </Text>
        {remoteCameraOff && (
          <View style={styles.cameraOffRow}>
            <Ionicons name="videocam-off" size={16} color={themeColors.subText} />
            <Text style={[styles.cameraOffText, { color: themeColors.subText }]}>Camera off</Text>
          </View>
        )}
      </View>

      {RTCView && tiles.local === 'video' && (
        <View style={[styles.pip, { top: insets.top + 16, borderColor: themeColors.border }]}>
          <RTCView
            streamURL={session.localStream!.toURL()}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
            mirror={session.frontCamera}
            zOrder={1}
          />
        </View>
      )}

      {/* Own camera off: an opaque tile with my username instead of a frozen frame or an empty gap. */}
      {tiles.local === 'panel' && (
        <View
          style={[
            styles.pip,
            styles.pipOff,
            { top: insets.top + 16, borderColor: themeColors.border, backgroundColor: themeColors.cardBackground },
          ]}
          accessibilityLabel="Your camera is off"
        >
          <Ionicons name="videocam-off" size={22} color={themeColors.subText} />
          <Text style={[styles.pipName, { color: themeColors.text }]} numberOfLines={2}>
            {currentUser?.username ?? ''}
          </Text>
        </View>
      )}

      {mute === 'corner' && (
        <View
          style={[styles.cornerBadge, { bottom: insets.bottom + 112 }]}
          accessibilityLabel={`${otherName} is muted`}
        >
          <Ionicons name="mic-off" size={18} color="#FFFFFF" />
        </View>
      )}

      <View style={[styles.controls, { paddingBottom: insets.bottom + 28 }]}>
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
              accessibilityLabel="Hang up"
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
  top: { alignItems: 'center', gap: 10, paddingHorizontal: 24 },
  avatarWrap: { marginBottom: 8 },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Small muted-microphone badge on the lower edge of the profile circle.
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Over live video the badge needs its own dark backing to stay readable on bright frames.
  cornerBadge: {
    position: 'absolute',
    left: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: 46, fontWeight: '600' },
  name: { fontSize: 26, fontWeight: '600', maxWidth: 300 },
  status: { fontSize: 16 },
  // Text drawn on top of the remote video needs a shadow to stay readable on bright frames.
  overVideo: { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 6 },
  pip: {
    position: 'absolute',
    right: 16,
    width: 108,
    height: 152,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap', // very narrow screens wrap onto a second row instead of clipping
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  // Five buttons (mute, speaker, camera, switch camera, hang up) must fit a 360dp-wide screen: 5 x 56 + 4 x 10 = 320.
  round: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  // The phone glyph points up-right; turned over it reads as "hang up".
  hangUpIcon: { transform: [{ rotate: '135deg' }] },
  pill: { paddingHorizontal: 36, paddingVertical: 14, borderRadius: 28 },
  pillText: { fontSize: 16, fontWeight: '600' },
  cameraOffRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  cameraOffText: { fontSize: 14 },
  pipOff: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 8 },
  pipName: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
