/**
 * onboarding.tsx
 * Three intro slides shown once, before the first sign-in (SRS section 5: splash + onboarding).
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, MapButton, Page, Paper, POINTER, Tack, Text } from '../components/parchment';
import { useTheme } from '../hooks/themeContext';
import { markOnboardingSeen } from '../services/onboarding';

interface Slide {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    id: 'chat',
    icon: 'chatbubbles',
    title: 'Chat in real time',
    body: 'One-to-one and group conversations with delivery and read status, replies, forwarding and search.',
  },
  {
    id: 'share',
    icon: 'location',
    title: 'More than text',
    body: 'Send GIFs, start a voice or video call, and share your live location for 15 minutes, 1 hour or 8 hours. You can stop any time.',
  },
  {
    id: 'yours',
    icon: 'notifications',
    title: 'Make it yours',
    body: 'Pick your own ringtone and alert sounds from the Me tab, and mute the chats you do not need.',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { themeColors } = useTheme();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  // The width of the screen itself, not of the window: in a wide browser window the app is a narrower column.
  const windowWidth = useWindowDimensions().width;
  const [width, setWidth] = useState(windowWidth);
  const onLayout = (e: LayoutChangeEvent) => {
    const measured = Math.round(e.nativeEvent.layout.width);
    if (measured > 0 && measured !== width) setWidth(measured);
  };
  // After the width changes (a resized browser window) stay on the same slide.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: index * width, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  const finish = async () => {
    await markOnboardingSeen();
    router.replace('/(auth)/login');
  };

  const next = () => {
    if (isLast) {
      void finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <Page variant="map" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }}>
      <View style={styles.fill} onLayout={onLayout}>
        <View style={styles.topRow}>
          {!isLast && (
            <Pressable
              onPress={finish}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Skip introduction"
              style={POINTER}
            >
              <Text kind="hand" style={[styles.skip, { color: themeColors.subText }]}>
                Skip
              </Text>
            </Pressable>
          )}
        </View>

        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(s) => s.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width }]}>
              <Avatar
                size={132}
                seed={item.id}
                icon={<Ionicons name={item.icon} size={58} color={themeColors.accent} />}
              />
              <Paper trail pin="tack" contentStyle={styles.card} style={styles.cardWrap}>
                <Text kind="display" style={[styles.title, { color: themeColors.ink }]}>
                  {item.title}
                </Text>
                <Text style={[styles.body, { color: themeColors.inkSoft }]}>{item.body}</Text>
              </Paper>
            </View>
          )}
        />

        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <Tack
              key={s.id}
              size={i === index ? 17 : 11}
              color={i === index ? themeColors.pins[2] : themeColors.brass}
            />
          ))}
        </View>

        <MapButton
          title={isLast ? 'Get started' : 'Next'}
          variant="wax"
          onPress={next}
          style={styles.button}
        />
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topRow: { height: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 22 },
  skip: { fontSize: 20, lineHeight: 24 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, gap: 28 },
  cardWrap: { alignSelf: 'stretch' },
  card: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: 22, gap: 10 },
  title: { fontSize: 32, lineHeight: 38, textAlign: 'center' },
  body: { fontSize: 18, lineHeight: 25, textAlign: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20, height: 20 },
  button: { marginHorizontal: 24 },
});
