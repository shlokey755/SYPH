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
import { useTheme } from '../../hooks/themeContext';
import { useAuth } from '../../hooks/useAuth';
import { useCallSession } from '../../hooks/useCallSession';
import { useIncomingCalls } from '../../hooks/useIncomingCalls';
import { getWebRTC } from '../../services/webrtc';
import { CallType } from '../../types';
import { endReasonText, formatCallClock } from '../../utils/call';

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
  const remoteHasVideo = isVideo && !!session.remoteStream && session.remoteStream.getVideoTracks().length > 0;
  const showLocalVideo = isVideo && !!session.localStream && !session.cameraOff && phase !== 'ended';
  const ended = phase === 'ended';

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
          <View style={[styles.avatar, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.accent }]}>
            <Text style={[styles.initial, { color: themeColors.accent }]}>
              {(otherName || '?').charAt(0).toUpperCase()}
            </Text>
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
      </View>

      {RTCView && showLocalVideo && (
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
              <Ionicons name="call" size={28} color="#FFFFFF" style={styles.hangUpIcon} />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function ControlButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const { themeColors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[
        styles.round,
        { backgroundColor: active ? themeColors.accent : themeColors.cardBackground, borderColor: themeColors.border },
        styles.bordered,
      ]}
    >
      <Ionicons name={icon} size={26} color={active ? themeColors.buttonText : themeColors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { alignItems: 'center', gap: 10, paddingHorizontal: 24 },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingHorizontal: 16,
  },
  round: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  bordered: { borderWidth: 1 },
  // The phone glyph points up-right; turned over it reads as "hang up".
  hangUpIcon: { transform: [{ rotate: '135deg' }] },
  pill: { paddingHorizontal: 36, paddingVertical: 14, borderRadius: 28 },
  pillText: { fontSize: 16, fontWeight: '600' },
});
