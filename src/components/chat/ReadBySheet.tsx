/**
 * ReadBySheet.tsx
 * "Read by": the people who have seen a message you sent, each with their avatar, their username and the time they read it.
 * Newest first. Opens from the avatar queue. Closes with the X, a tap outside, or by dragging the sheet down. The sender is
 * never in the list.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../hooks/themeContext';
import { timeWithDay } from '../../utils/dateLabels';
import { readByList, Reader } from '../../utils/receipts';
import { InitialAvatar } from './InitialAvatar';

export interface ReaderName {
  username: string;
  /** Shown under the username when they have set one that differs. */
  displayName?: string;
}

interface Props {
  /** The readers to list; null keeps the sheet closed. */
  readers: Reader[] | null;
  nameOf: (uid: string) => ReaderName;
  colors: ThemeColors;
  onClose: () => void;
}

const CLOSE_DRAG = 90;

export function ReadBySheet({ readers, nameOf, colors, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const drag = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (readers) drag.setValue(0);
  }, [readers, drag]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > CLOSE_DRAG || g.vy > 1) closeRef.current();
        else Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
    })
  ).current;

  if (!readers) return null;
  const rows = readByList(readers);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        {/* The sheet swallows taps so only the backdrop closes it. */}
        <Pressable onPress={() => {}} style={styles.stop}>
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.border,
                paddingBottom: Math.max(insets.bottom, 12),
                transform: [{ translateY: drag }],
              },
            ]}
          >
            <View {...pan.panHandlers}>
              <View style={[styles.grabber, { backgroundColor: colors.border }]} />
              <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
                  Read by
                </Text>
                <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                  <Ionicons name="close" size={22} color={colors.text} />
                </Pressable>
              </View>
            </View>
            <ScrollView style={{ maxHeight: height * 0.5 }}>
              {rows.map((reader) => {
                const name = nameOf(reader.uid);
                const time = timeWithDay(reader.at);
                return (
                  <View
                    key={reader.uid}
                    style={styles.row}
                    accessible
                    accessibilityLabel={`${name.username} read this message at ${time}`}
                  >
                    <InitialAvatar name={name.username} size={36} colors={colors} />
                    <View style={styles.names}>
                      <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
                        {name.username}
                      </Text>
                      {name.displayName ? (
                        <Text style={[styles.display, { color: colors.subText }]} numberOfLines={1}>
                          {name.displayName}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.time, { color: colors.subText }]}>{time}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  stop: { width: '100%' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, borderBottomWidth: 0 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginTop: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  names: { flex: 1 },
  username: { fontSize: 15, fontWeight: '600' },
  display: { fontSize: 12 },
  time: { fontSize: 13 },
});
