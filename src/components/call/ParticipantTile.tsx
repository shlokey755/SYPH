/**
 * ParticipantTile.tsx
 * One person's square on the group call screen: their live video, or an opaque panel with their name when there is no
 * video (a voice call, their camera is off, or the video has not arrived yet). A small muted-microphone badge sits at
 * the bottom-left whenever they are muted.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MediaStream } from 'react-native-webrtc';
import { useTheme } from '../../hooks/themeContext';
import { getWebRTC } from '../../services/webrtc';

interface Props {
  name: string;
  stream: MediaStream | null;
  mode: 'video' | 'panel';
  muted: boolean;
  /** "Connecting…" / "Can't connect"; empty when all is well. */
  caption?: string;
  /** Mirror the picture (your own front camera). */
  mirror?: boolean;
  width: number;
  height: number;
}

export function ParticipantTile({ name, stream, mode, muted, caption, mirror, width, height }: Props) {
  const { themeColors } = useTheme();
  const RTCView = getWebRTC()?.RTCView;
  const showVideo = mode === 'video' && !!RTCView && !!stream;
  const initial = (name || '?').charAt(0).toUpperCase();
  const avatar = Math.max(40, Math.min(96, Math.floor(Math.min(width, height) * 0.4)));

  return (
    <View style={{ width, height, padding: TILE_GAP }}>
      <View
        style={[styles.tile, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}
        accessibilityLabel={muted ? `${name}, muted` : name}
      >
        {showVideo ? (
          <RTCView streamURL={stream!.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" mirror={mirror} zOrder={0} />
        ) : (
          <View style={styles.panel}>
            <View
              style={[
                styles.avatar,
                { width: avatar, height: avatar, borderRadius: avatar / 2, borderColor: themeColors.accent },
              ]}
            >
              <Text style={[styles.initial, { color: themeColors.accent, fontSize: avatar * 0.45 }]}>{initial}</Text>
            </View>
            <Text style={[styles.name, { color: themeColors.text }]} numberOfLines={1}>
              {name}
            </Text>
            {!!caption && <Text style={[styles.caption, { color: themeColors.subText }]}>{caption}</Text>}
          </View>
        )}

        <View style={styles.badges}>
          {muted && (
            <View style={styles.badge} accessibilityLabel={`${name} is muted`}>
              <Ionicons name="mic-off" size={16} color="#FFFFFF" />
            </View>
          )}
          {showVideo && (
            <View style={styles.namePill}>
              <Text style={styles.namePillText} numberOfLines={1}>
                {name}
              </Text>
              {!!caption && <Text style={styles.namePillText}> · {caption}</Text>}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export const TILE_GAP = 3;

const styles = StyleSheet.create({
  tile: { flex: 1, borderRadius: 12, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  panel: { alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  avatar: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '600' },
  name: { fontSize: 15, fontWeight: '600', maxWidth: '100%' },
  caption: { fontSize: 12 },
  // Over live video the badges need their own dark backing to stay readable on bright frames.
  badges: { position: 'absolute', left: 6, bottom: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  namePill: {
    flexShrink: 1,
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  namePillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
});
