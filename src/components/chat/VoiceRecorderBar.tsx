/**
 * VoiceRecorderBar.tsx
 * Replaces the text input while a voice note is being recorded (FR-05).
 */

import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../../hooks/themeContext';
import { useToast } from '../../hooks/toastNotifications';
import { formatDuration } from '../../services/mediaService';

interface Props {
  colors: ThemeColors;
  onCancel: () => void;
  onSend: (uri: string, durationMs: number) => void;
}

const MIN_DURATION_MS = 600;

export function VoiceRecorderBar({ colors, onCancel, onSend }: Props) {
  const toast = useToast();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [ready, setReady] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          toast.error('Microphone permission needed', 'Allow microphone access in your phone settings.');
          onCancel();
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setReady(true);
      } catch (e) {
        toast.error('Could not start recording', e instanceof Error ? e.message : undefined);
        onCancel();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async (send: boolean) => {
    const durationMs = state.durationMillis;
    try {
      await recorder.stop();
    } catch {
      // Already stopped.
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    const uri = recorder.uri;
    if (send && uri && durationMs >= MIN_DURATION_MS) {
      onSend(uri, durationMs);
    } else {
      if (send) toast.info('Hold a little longer', 'Voice message was too short.');
      onCancel();
    }
  };

  return (
    <View style={styles.row}>
      <Pressable onPress={() => finish(false)} hitSlop={10} accessibilityLabel="Cancel recording">
        <Ionicons name="trash" size={24} color={colors.danger} />
      </Pressable>
      <View style={styles.center}>
        <View style={[styles.dot, { backgroundColor: colors.danger, opacity: ready ? 1 : 0.3 }]} />
        <Text style={[styles.time, { color: colors.text }]}>{formatDuration(state.durationMillis)}</Text>
        <Text style={{ color: colors.subText, fontSize: 12 }}>{ready ? 'Recording...' : 'Starting...'}</Text>
      </View>
      <Pressable
        onPress={() => finish(true)}
        disabled={!ready}
        accessibilityLabel="Send voice message"
        style={[styles.send, { backgroundColor: colors.accent }, !ready && { opacity: 0.4 }]}
      >
        <Ionicons name="send" size={18} color={colors.buttonText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 42 },
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  time: { fontSize: 16, fontVariant: ['tabular-nums'] },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
