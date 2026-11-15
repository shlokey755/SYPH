/**
 * ParticipantTile.web.tsx
 * One person's frame on the group call screen in a browser: their live video, or a parchment panel with their face and name when
 * there is no video (a voice call, their camera is off, or the picture has not arrived yet), in a wooden frame with a brass line
 * inside it. A wax badge marks a muted microphone. Same props as ParticipantTile.tsx. A phone never loads this file.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { MediaStream } from 'react-native-webrtc';
import { getWebRTC } from '../../services/webrtc';
import { useTheme } from '../../theme/mapTheme';
import { withAlpha } from '../../theme/parchment';
import { Avatar, Text } from '../parchment';

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
  const { themeColors: c } = useTheme();
  const RTCView = getWebRTC()?.RTCView;
  const showVideo = mode === 'video' && !!RTCView && !!stream;
  const face = Math.max(40, Math.min(96, Math.floor(Math.min(width, height) * 0.4)));

  return (
    <View style={{ width, height, padding: TILE_GAP }}>
      <View
        style={[styles.tile, { backgroundColor: c.paperAlt, borderColor: c.wood }]}
        accessibilityLabel={muted ? `${name}, muted` : name}
      >
        {showVideo ? (
          <RTCView streamURL={stream!.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" mirror={mirror} zOrder={0} />
        ) : (
          <View style={styles.panel}>
            <Avatar name={name || '?'} size={face} />
            <Text kind="body" numberOfLines={1} style={[styles.name, { color: c.ink }]}>
              {name}
            </Text>
            {!!caption && (
              <Text kind="hand" style={[styles.caption, { color: c.inkSoft }]}>
                {caption}
              </Text>
            )}
          </View>
        )}

        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 1, borderColor: withAlpha(c.brass, 0.9) }]} />

        <View style={styles.badges}>
          {muted && (
            <View style={[styles.badge, { backgroundColor: c.stamp }]} accessibilityLabel={`${name} is muted`}>
              <Ionicons name="mic-off" size={16} color={c.buttonText} />
            </View>
          )}
          {showVideo && (
            <View style={[styles.plate, { backgroundColor: withAlpha(c.wood, 0.92) }]}>
              <Text kind="label" numberOfLines={1} style={[styles.plateText, { color: c.buttonText }]}>
                {caption ? `${name} · ${caption}` : name}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export const TILE_GAP = 6;

const styles = StyleSheet.create({
  tile: { flex: 1, borderWidth: 3, borderRadius: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  panel: { alignItems: 'center', gap: 6, paddingHorizontal: 8, maxWidth: '100%' },
  name: { fontSize: 18, lineHeight: 22, fontWeight: '700', maxWidth: '100%' },
  caption: { fontSize: 16, lineHeight: 19 },
  badges: { position: 'absolute', left: 6, bottom: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  plate: { flexShrink: 1, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 3 },
  plateText: { fontSize: 13, letterSpacing: 1 },
});
