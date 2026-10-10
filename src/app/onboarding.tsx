/**
 * onboarding.tsx
 * Three intro slides shown once, before the first sign-in (SRS section 5: splash + onboarding).
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
    icon: 'images',
    title: 'Share more than text',
    body: 'Send photos, videos, voice notes, GIFs, stickers and documents. Uploads show their progress.',
  },
  {
    id: 'yours',
    icon: 'color-palette',
    title: 'Make it yours',
    body: 'Cyan and Black by default, or switch themes any time from the Me tab. Mute chats you do not need.',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { themeColors } = useTheme();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

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
    <View
      style={[
        styles.container,
        { backgroundColor: themeColors.background, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) },
      ]}
    >
      <View style={styles.topRow}>
        {!isLast && (
          <Pressable onPress={finish} hitSlop={10} accessibilityLabel="Skip introduction">
            <Text style={[styles.skip, { color: themeColors.subText }]}>Skip</Text>
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
            <View style={[styles.iconWrap, { borderColor: themeColors.accent }]}>
              <Ionicons name={item.icon} size={64} color={themeColors.accent} />
            </View>
            <Text style={[styles.title, { color: themeColors.text }]}>{item.title}</Text>
            <Text style={[styles.body, { color: themeColors.subText }]}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <View
            key={s.id}
            style={[
              styles.dot,
              { backgroundColor: i === index ? themeColors.accent : themeColors.border },
              i === index && styles.dotActive,
            ]}
          />
        ))}
      </View>

      <Pressable
        onPress={next}
        accessibilityRole="button"
        style={[styles.button, { backgroundColor: themeColors.accent }]}
      >
        <Text style={[styles.buttonText, { color: themeColors.buttonText }]}>
          {isLast ? 'Get started' : 'Next'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topRow: { height: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 20 },
  skip: { fontSize: 15, fontWeight: '600' },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 16 },
  iconWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 23, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 22 },
  button: { marginHorizontal: 24, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
});
