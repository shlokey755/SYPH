/**
 * ColorWheel.tsx
 * A ring of hues to pick an accent colour from. Touch or drag anywhere on the square: the hue is the direction from the middle
 * (12 o'clock is 0, clockwise). The square marker and the swatch in the middle follow the finger; the choice is handed on when the
 * finger lifts, so the whole app is not recoloured on every move.
 *
 * Drawn with plain views (120 thin slices turned around the middle), so it needs no extra package, works in Expo Go, and has no
 * rounded corners like the rest of the app. The ring shows the colours the accent really takes on this theme (utils/accentColor.ts):
 * brighter on a dark theme, deeper on a light one. Geometry is in utils/colorWheel.ts.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { accentColors, accentForHue, normalizeHue } from '../../utils/accentColor';
import { RING_INNER, RING_OUTER, hueFromPoint, pointForHue, segmentHues, segmentWidth } from '../../utils/colorWheel';

const MARKER = 24;

interface Props {
  /** Side of the square, in points. */
  size: number;
  /** The hue in use, or null while the theme's own accent is used. */
  hue: number | null;
  /** The colours in use now: shown in the middle while no hue is picked. */
  accent: string;
  onAccent: string;
  /** Whether the theme is dark: decides which version of each colour the ring shows. */
  isDark: boolean;
  /** The colour of the marker's frame. */
  markerColor: string;
  /** Called with the hue (0 to 359) when the finger is lifted. */
  onCommit: (hue: number) => void;
}

export function ColorWheel({ size, hue, accent, onAccent, isDark, markerColor, onCommit }: Props) {
  // What the finger is on right now; null once the app has taken the choice over (`hue`).
  const [draft, setDraft] = useState<number | null>(null);
  const draftRef = useRef<number | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    draftRef.current = null;
    setDraft(null);
  }, [hue]);

  const panResponder = useMemo(() => {
    const pick = (x: number, y: number) => {
      const picked = hueFromPoint(x, y, size);
      if (picked === null) return;
      const next = normalizeHue(picked);
      draftRef.current = next;
      setDraft(next);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The Me tab scrolls: once the finger is on the wheel the wheel keeps it.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (event) => pick(event.nativeEvent.locationX, event.nativeEvent.locationY),
      onPanResponderMove: (event) => pick(event.nativeEvent.locationX, event.nativeEvent.locationY),
      onPanResponderRelease: () => {
        if (draftRef.current !== null) commitRef.current(draftRef.current);
      },
      onPanResponderTerminate: () => {
        draftRef.current = null;
        setDraft(null);
      },
    });
  }, [size]);

  const middleRadius = ((RING_OUTER + RING_INNER) / 2) * size;
  const slices = useMemo(() => {
    const width = segmentWidth(size);
    const length = (RING_OUTER - RING_INNER) * size + 1;
    return segmentHues().map((sliceHue) => ({
      key: sliceHue,
      style: {
        position: 'absolute' as const,
        left: size / 2 - width / 2,
        top: size / 2 - length / 2,
        width,
        height: length,
        backgroundColor: accentForHue(sliceHue, isDark),
        transform: [{ rotate: `${sliceHue}deg` }, { translateY: -middleRadius }],
      },
    }));
  }, [size, isDark, middleRadius]);

  const shown = draft ?? hue;
  const picked = shown === null ? null : accentColors(shown, isDark);
  const marker = shown === null ? null : pointForHue(shown, middleRadius, size);
  const swatch = size * 0.34;

  const nudge = (delta: number) => commitRef.current(normalizeHue((shown ?? 0) + delta));

  return (
    <View
      style={{ width: size, height: size, alignSelf: 'center' }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Accent colour wheel"
      accessibilityValue={{ text: shown === null ? "The theme's own colour" : `Hue ${shown} degrees` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => nudge(event.nativeEvent.actionName === 'increment' ? 15 : -15)}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {slices.map((slice) => (
          <View key={slice.key} style={slice.style} />
        ))}
        <View
          style={[
            styles.swatch,
            {
              width: swatch,
              height: swatch,
              left: (size - swatch) / 2,
              top: (size - swatch) / 2,
              backgroundColor: picked?.accent ?? accent,
              borderColor: markerColor,
            },
          ]}
        >
          <Text style={[styles.swatchText, { color: picked?.buttonText ?? onAccent }]}>
            {shown === null ? 'Theme' : `${shown}°`}
          </Text>
        </View>
        {marker && picked ? (
          <View
            style={[
              styles.marker,
              { left: marker.x - MARKER / 2, top: marker.y - MARKER / 2, backgroundColor: picked.accent, borderColor: markerColor },
            ]}
          />
        ) : null}
      </View>
      {/* The touch layer: one view over everything, so every touch is reported against the wheel itself. */}
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} />
    </View>
  );
}

const styles = StyleSheet.create({
  swatch: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  swatchText: { fontSize: 15, fontWeight: '700' },
  marker: { position: 'absolute', width: MARKER, height: MARKER, borderWidth: 3 },
});
