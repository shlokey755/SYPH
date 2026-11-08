/**
 * ReturnToCallBubble.tsx
 * A small draggable bubble that shows while a call is running and the person is somewhere other than the call screen.
 * Tapping it goes back to the call. It floats instead of taking a bar across the top because every SYPH screen draws its
 * own header, which a bar would cover; drag it wherever it is out of the way, it settles against the nearer edge.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/themeContext';
import { useActiveCall, useDirectSession, useGroupSession } from '../../services/activeCallStore';
import { formatCallClock } from '../../utils/call';
import { CALL_ROUTE, clampBubble, isCallRoute, Point, Size, snapBubbleToEdge } from '../../utils/callBackground';

const BUBBLE: Size = { width: 68, height: 56 };
/** Room kept clear at the bottom, for the navigation bar and the tab bar. */
const BOTTOM_CLEARANCE = 72;

export function ReturnToCallBubble() {
  const active = useActiveCall();
  const direct = useDirectSession();
  const group = useGroupSession();
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const { themeColors } = useTheme();

  const margin = useMemo(() => ({ top: insets.top + 8, bottom: insets.bottom + BOTTOM_CLEARANCE }), [insets.top, insets.bottom]);
  const [dragged, setDragged] = useState<Point | null>(null);
  const place = clampBubble(
    dragged ?? { x: screen.width - BUBBLE.width - 8, y: insets.top + 96 },
    screen,
    BUBBLE,
    margin
  );

  // The responder is made once, so it reads these through refs.
  const geometry = useRef({ place, screen, margin });
  useEffect(() => {
    geometry.current = { place, screen, margin };
  });
  const startedAt = useRef<Point>(place);
  const responder = useMemo(() => {
    const moveTo = (dx: number, dy: number) => {
      const { screen: size, margin: bounds } = geometry.current;
      return clampBubble({ x: startedAt.current.x + dx, y: startedAt.current.y + dy }, size, BUBBLE, bounds);
    };
    const letGo = (dx: number, dy: number) => setDragged(snapBubbleToEdge(moveTo(dx, dy), geometry.current.screen, BUBBLE));
    return PanResponder.create({
      // Only a real drag takes over, so a tap still reaches the button.
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
      onPanResponderGrant: () => {
        startedAt.current = geometry.current.place;
      },
      onPanResponderMove: (_event, gesture) => setDragged(moveTo(gesture.dx, gesture.dy)),
      onPanResponderRelease: (_event, gesture) => letGo(gesture.dx, gesture.dy),
      onPanResponderTerminate: (_event, gesture) => letGo(gesture.dx, gesture.dy),
    });
  }, []);

  const session = active?.kind === 'group' ? group : direct;
  if (!active || !session || session.phase === 'ended' || isCallRoute(segments)) return null;

  const live = active.kind === 'group' ? group?.phase === 'in-call' : direct?.phase === 'connected';
  return (
    <View
      {...responder.panHandlers}
      style={[styles.bubble, { left: place.x, top: place.y, backgroundColor: themeColors.accent }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Return to call"
        onPress={() => router.push(CALL_ROUTE[active.kind])}
        style={styles.inner}
      >
        <Ionicons name="call" size={20} color={themeColors.buttonText} />
        <Text style={[styles.clock, { color: themeColors.buttonText }]}>{live ? formatCallClock(session.seconds) : '…'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    width: BUBBLE.width,
    height: BUBBLE.height,
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  clock: { fontSize: 12, fontWeight: '600' },
});
