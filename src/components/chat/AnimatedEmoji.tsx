/**
 * AnimatedEmoji.tsx
 * A message that is only emoji. Up to three emoji are shown as Google's animated Noto emoji (a gorilla stands up and beats
 * its chest, a heart pulses, ...), the way Google Messages does; the animation loops while the message is on screen.
 *
 * An emoji with no animation (not in Google's set, a skin tone, no network the first time) is shown big and still with a
 * one-time bounce when it appears; tap to bounce again. While an animation is loading the still emoji is shown, so the
 * bubble never has a hole in it. Long-press still opens the message menu. Plain React Native plus expo-image (already in the
 * app), so it needs no new package.
 *
 * The animation files come from Google's font CDN (utils/animatedEmoji.ts); the phone's "reduce motion" setting turns the
 * animation off.
 */

import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAnimatedEmojiIndex } from '../../hooks/useAnimatedEmojiIndex';
import { animationFailed, markAnimationFailed } from '../../services/animatedEmojiList';
import { animationSize, animationUrls, MAX_ANIMATED_IMAGES } from '../../utils/animatedEmoji';
import { emojiSize } from '../../utils/emoji';

interface Props {
  emojis: string[];
  onLongPress?: () => void;
}

const STAGGER_MS = 90;

function usePhoneReducesMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduced(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return reduced;
}

/** A still emoji that bounces in once (and again whenever `replay` changes). */
function BouncingEmoji({ emoji, size, order, replay, still }: { emoji: string; size: number; order: number; replay: number; still: boolean }) {
  const pop = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) {
      pop.setValue(1);
      return;
    }
    pop.setValue(0);
    const run = Animated.sequence([
      Animated.delay(order * STAGGER_MS),
      Animated.spring(pop, { toValue: 1, friction: 3.5, tension: 120, useNativeDriver: true }),
    ]);
    run.start();
    return () => run.stop();
  }, [pop, order, replay, still]);

  return (
    <Animated.Text
      style={[
        styles.emoji,
        {
          fontSize: size,
          lineHeight: Math.round(size * 1.25),
          opacity: pop.interpolate({ inputRange: [0, 0.25], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [
            { scale: pop },
            { rotate: pop.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-18deg', '10deg', '0deg'] }) },
          ],
        },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

/** One address of the animation: the still emoji underneath until the first frame arrives, then the animation. */
function PlayingEmoji({ emoji, url, size, onFailed }: { emoji: string; url: string; size: number; onFailed: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <View style={{ width: size, height: size }}>
      <Text style={[styles.still, { fontSize: size * 0.7, lineHeight: size, opacity: loaded ? 0 : 1 }]}>{emoji}</Text>
      <Image
        source={{ uri: url }}
        recyclingKey={url}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        autoplay
        cachePolicy="disk"
        accessibilityLabel={emoji}
        onLoad={() => setLoaded(true)}
        onError={() => {
          markAnimationFailed(url);
          onFailed();
        }}
      />
    </View>
  );
}

function OneEmoji({ emoji, count, order, replay, reduced }: { emoji: string; count: number; order: number; replay: number; reduced: boolean }) {
  const index = useAnimatedEmojiIndex();
  const [, retry] = useState(0);
  const wantsAnimation = count <= MAX_ANIMATED_IMAGES && !reduced;
  // The first address not known to have failed; a failure re-renders (`retry`) so the next one is picked.
  const url = wantsAnimation ? animationUrls(emoji, index).find((candidate) => !animationFailed(candidate)) : undefined;
  if (url) {
    return <PlayingEmoji key={url} emoji={emoji} url={url} size={animationSize(count)} onFailed={() => retry((n) => n + 1)} />;
  }
  return <BouncingEmoji emoji={emoji} size={emojiSize(count)} order={order} replay={replay} still={reduced} />;
}

export function AnimatedEmoji({ emojis, onLongPress }: Props) {
  const reduced = usePhoneReducesMotion();
  const [replay, setReplay] = useState(0);
  const again = useCallback(() => setReplay((n) => n + 1), []);
  return (
    <Pressable onPress={again} onLongPress={onLongPress} delayLongPress={250} accessibilityLabel={emojis.join(' ')}>
      <View style={styles.row}>
        {emojis.map((emoji, order) => (
          <OneEmoji key={`${order}-${emoji}`} emoji={emoji} count={emojis.length} order={order} replay={replay} reduced={reduced} />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  emoji: { marginHorizontal: 1 },
  still: { position: 'absolute', left: 0, right: 0, top: 0, textAlign: 'center' },
});
