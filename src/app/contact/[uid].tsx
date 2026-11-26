/**
 * app/contact/[uid].tsx
 * The other person's profile, opened by tapping their name at the top of a 1-on-1 chat: avatar, name, username, email, and
 * below that a scrolling log of the audio and video calls the two of you have had, with the day and time of each.
 *
 * Params: `uid` (them), `cid` (the chat it was opened from), and `name` / `username` as what to show until their profile has
 * loaded. The email is whatever they have shared in that chat (utils/contactEmail.ts); the log is the call documents between
 * the two of you (services/callLogService.ts).
 *
 * Phone only: the browser version has its own screens (docs/PARCHMENT.md) and does not link here.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InitialAvatar } from '../../components/chat/InitialAvatar';
import { useAuth } from '../../hooks/useAuth';
import { useCallLog } from '../../hooks/useCallLog';
import { useProfiles } from '../../hooks/useProfiles';
import { useSharedEmail } from '../../hooks/useSharedEmail';
import { useTheme } from '../../hooks/themeContext';
import { CallLogEntry, callStatusText, callTitle, isMissedIncoming } from '../../utils/callLog';
import { emailLine } from '../../utils/contactEmail';
import { dayAndTime } from '../../utils/dateLabels';

const paramOf = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? '';

export default function ContactScreen() {
  const params = useLocalSearchParams<{ uid?: string; cid?: string; name?: string; username?: string }>();
  const uid = paramOf(params.uid);
  const conversationId = paramOf(params.cid);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { themeColors } = useTheme();
  const { currentUser } = useAuth();

  const { nameOf, usernameOf } = useProfiles(uid ? [uid] : []);
  const username = usernameOf(uid) || paramOf(params.username);
  const name = nameOf(uid) || paramOf(params.name) || username || 'Someone';

  const email = useSharedEmail(conversationId, uid);
  const { entries, loading, failed } = useCallLog(currentUser?.uid, uid);
  // One "now" per refresh of the list, so every row says "Today" or "Yesterday" by the same clock.
  const now = useMemo(() => Date.now(), [entries]);

  const renderEntry = ({ item }: { item: CallLogEntry }) => {
    const missed = isMissedIncoming(item);
    const tint = missed ? themeColors.danger : themeColors.text;
    return (
      <View style={[styles.row, { borderBottomColor: themeColors.border }]}>
        <View style={[styles.rowIcon, { borderColor: missed ? themeColors.danger : themeColors.border }]}>
          <Ionicons name={item.kind === 'video' ? 'videocam' : 'call'} size={20} color={tint} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: tint }]} numberOfLines={1}>
            {callTitle(item)}
          </Text>
          <Text style={[styles.rowStatus, { color: missed ? themeColors.danger : themeColors.subText }]} numberOfLines={1}>
            {callStatusText(item)}
          </Text>
        </View>
        <Text style={[styles.rowTime, { color: themeColors.subText }]}>{dayAndTime(item.atMs, now)}</Text>
      </View>
    );
  };

  const empty = loading ? (
    <ActivityIndicator style={styles.emptyBox} color={themeColors.accent} />
  ) : (
    <Text style={[styles.emptyText, { color: themeColors.subText }]}>
      {failed ? 'Could not load the call history.' : 'No calls yet.'}
    </Text>
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background, paddingTop: insets.top }]}>
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </Pressable>
        <Text style={[styles.topTitle, { color: themeColors.text }]}>Profile</Text>
      </View>

      <View style={styles.identity}>
        <InitialAvatar name={name} size={96} colors={themeColors} />
        <Text style={[styles.name, { color: themeColors.text }]} numberOfLines={1}>
          {name}
        </Text>
        {username ? (
          <Text style={[styles.username, { color: themeColors.subText }]} numberOfLines={1}>
            @{username}
          </Text>
        ) : null}
      </View>

      <View style={[styles.field, { borderColor: themeColors.border, backgroundColor: themeColors.cardBackground }]}>
        <Text style={[styles.fieldLabel, { color: themeColors.subText }]}>Email</Text>
        <Text
          selectable
          style={[styles.fieldValue, { color: email.status === 'email' ? themeColors.text : themeColors.subText }]}
          numberOfLines={1}
        >
          {emailLine(email)}
        </Text>
      </View>

      <Text style={[styles.sectionTitle, { color: themeColors.subText }]}>Call history</Text>
      <FlatList
        style={styles.list}
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={renderEntry}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topTitle: { fontSize: 18, fontWeight: '700' },
  identity: { alignItems: 'center', paddingTop: 24, paddingBottom: 16, paddingHorizontal: 16 },
  name: { fontSize: 22, fontWeight: '700', marginTop: 12 },
  username: { fontSize: 15, marginTop: 2 },
  field: { marginHorizontal: 16, paddingHorizontal: 14, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth },
  fieldLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  fieldValue: { fontSize: 16, marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowStatus: { fontSize: 13, marginTop: 2 },
  rowTime: { fontSize: 12, textAlign: 'right', maxWidth: '38%' },
  emptyBox: { marginTop: 32 },
  emptyText: { textAlign: 'center', marginTop: 32, fontSize: 15 },
});
