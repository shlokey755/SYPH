/**
 * useSwipeToReply.ts
 * Swipe a message to the right to reply to it. Gives back what the bubble needs: `offset` (how far to draw it moved),
 * `panHandlers` for its row, and `progress` (0 to 1) for fading in the reply arrow behind it.
 *
 * Uses React Native's own PanResponder and Animated, so it needs no extra package. A swipe is claimed only when it is
 * clearly sideways (utils/swipeReply.ts), so scrolling the list up and down, tapping and long-pressing work as before.
 * Letting go past the trigger distance calls `onReply`; the message then springs back either way.
 */

import { useRef } from 'react';
import { Animated, PanResponder } from 'react-native';
import { NATIVE_DRIVER } from '../components/parchment/platform';
import {
  shouldCaptureSwipe,
  SWIPE_ICON_FULL_AT,
  swipeOffset,
  swipeTriggers,
} from '../utils/swipeReply';

export function useSwipeToReply(onReply: () => void, enabled: boolean) {
  const offset = useRef(new Animated.Value(0)).current;
  // The responder is created once; these refs let it see the latest callback and switch.
  const replyRef = useRef(onReply);
  replyRef.current = onReply;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const responder = useRef(
    (() => {
      const settle = () =>
        Animated.spring(offset, { toValue: 0, friction: 8, tension: 140, useNativeDriver: NATIVE_DRIVER }).start();
      return PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        // Capture phase: claim a clear sideways swipe before the bubble's own touch handling does.
        onMoveShouldSetPanResponderCapture: (_, g) => enabledRef.current && shouldCaptureSwipe(g.dx, g.dy),
        onPanResponderGrant: () => offset.stopAnimation(),
        onPanResponderMove: (_, g) => offset.setValue(swipeOffset(g.dx)),
        onPanResponderRelease: (_, g) => {
          if (enabledRef.current && swipeTriggers(g.dx)) replyRef.current();
          settle();
        },
        onPanResponderTerminate: settle,
        // Once it is a swipe, the list does not get to take it over.
        onPanResponderTerminationRequest: () => false,
      });
    })()
  ).current;

  const progress = useRef(
    offset.interpolate({ inputRange: [0, SWIPE_ICON_FULL_AT], outputRange: [0, 1], extrapolate: 'clamp' })
  ).current;

  return { offset, progress, panHandlers: responder.panHandlers };
}
