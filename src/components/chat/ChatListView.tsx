/**
 * ChatListView.tsx - the list of chats
 * Recent 1-on-1 and group conversations with search, unread counts and mute indicators. On a phone it is the Chat tab
 * (app/(tabs)/index.tsx); in a desktop browser window it is the pane beside the open page (components/desktop/DesktopShell.tsx),
 * where `activeId` marks the chat that is open.
 * Each conversation is a dispatch pinned to the map: a brass medallion of the person, the name in blackletter, the time in quill.
 * A dispatch you have not read yet is held up with a tack and sealed with a count in red wax.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OfflineBanner } from '../OfflineBanner';
import {
  Avatar,
  CountSeal,
  Loading,
  POINTER,
  Page,
  PageTitle,
  Paper,
  Text,
  TextInput,
  TrailLine,
} from '../parchment';
import { useTheme } from '../../theme/mapTheme';
import { useToast } from '../../hooks/toastNotifications';
import { useAuth } from '../../hooks/useAuth';
import { useConversations } from '../../hooks/useConversations';
import { useProfiles } from '../../hooks/useProfiles';
import { useUserSettings } from '../../hooks/useUserSettings';
import { Conversation } from '../../types';
import {
  formatListTime,
  getConversationTitle,
  getOtherParticipant,
} from '../../utils/conversation';

export function ChatListView({ activeId = null }: { activeId?: string | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { currentUser } = useAuth();
  const { themeColors } = useTheme();
  const { conversations, isLoading, deleteConversation, unreadTotal } = useConversations();
  const { isMuted } = useUserSettings();
  const [searchText, setSearchText] = useState('');

  const myUid = currentUser?.uid;

  const otherUids = useMemo(
    () =>
      conversations
        .map((c) => getOtherParticipant(c, myUid)?.uid)
        .filter((uid): uid is string => !!uid),
    [conversations, myUid]
  );
  const { nameOf } = useProfiles(otherUids);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        getConversationTitle(c, myUid, nameOf).toLowerCase().includes(q) ||
        (c.lastMessage ?? '').toLowerCase().includes(q)
    );
  }, [conversations, searchText, myUid, nameOf]);

  // Beside an open chat (desktop), choosing another one swaps it, so the stack does not pile up a screen per click.
  const openChat = (id: string) =>
    activeId ? router.replace({ pathname: '/chat/[id]', params: { id } }) : router.push({ pathname: '/chat/[id]', params: { id } });

  const confirmDelete = (conv: Conversation) => {
    Alert.alert(
      'Delete chat',
      'This removes the chat from your list. It comes back if someone sends a new message.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteConversation(conv.id).catch(() => toast.error('Could not delete chat')),
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Conversation }) => {
    const title = getConversationTitle(item, myUid, nameOf);
    const other = getOtherParticipant(item, myUid);
    const unread = myUid ? (item.unread?.[myUid] ?? 0) : 0;
    const muted = isMuted(item.id);
    const mine = item.lastMessageSenderId === myUid;
    const prefix = mine ? 'You: ' : item.isGroup && item.lastMessageSenderName ? `${item.lastMessageSenderName}: ` : '';

    return (
      <Pressable
        onPress={() => openChat(item.id)}
        onLongPress={() => confirmDelete(item)}
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `${title}, ${unread} unread` : title}
        style={({ pressed }) => [styles.press, POINTER, pressed && styles.pressed]}
      >
        {/* A new dispatch is tacked to the map; one you have read is only laid on it. */}
        <Paper
          tone={item.id === activeId ? 'alt' : 'paper'}
          seed={item.id}
          maxTilt={0.7}
          pin={unread > 0 ? 'tack' : 'none'}
          contentStyle={styles.row}
        >
          <Avatar
            name={title}
            size={48}
            icon={item.isGroup ? <Ionicons name="people" size={22} color={themeColors.ink} /> : undefined}
          />

          <View style={styles.body}>
            <View style={styles.line}>
              <Text kind="display" style={[styles.title, { color: themeColors.ink }]} numberOfLines={1}>
                {title}
              </Text>
              <Text kind="hand" style={[styles.time, { color: unread > 0 ? themeColors.stamp : themeColors.inkSoft }]}>
                {formatListTime(item.lastMessageTime ?? null)}
              </Text>
            </View>
            <View style={styles.line}>
              <Text
                style={[styles.preview, { color: unread > 0 ? themeColors.ink : themeColors.inkSoft }]}
                numberOfLines={1}
              >
                {item.lastMessage ? `${prefix}${item.lastMessage}` : 'No messages yet'}
              </Text>
              {muted && <Ionicons name="notifications-off" size={14} color={themeColors.inkSoft} />}
              <CountSeal count={unread} />
            </View>
          </View>
        </Paper>
      </Pressable>
    );
  };

  return (
    <Page variant="map" style={{ paddingTop: insets.top }}>
      <PageTitle
        title="Chats"
        note={unreadTotal > 0 ? `${unreadTotal} new ${unreadTotal === 1 ? 'dispatch' : 'dispatches'}` : 'all quiet on deck'}
        style={styles.header}
      />
      <TrailLine x style={styles.trail} />

      <OfflineBanner message="You're offline. Chats update when you reconnect." />

      <View style={styles.searchWrap}>
        <Paper trail lift={1} contentStyle={styles.search}>
          <Ionicons name="search" size={18} color={themeColors.inkSoft} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.ink }]}
            placeholder="Search chats"
            placeholderTextColor={themeColors.inkSoft}
            value={searchText}
            onChangeText={setSearchText}
            autoCapitalize="none"
          />
        </Paper>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <Loading label="Charting the course..." />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Paper torn="both" angle={1.2} contentStyle={styles.empty}>
            <Ionicons name={searchText ? 'search' : 'boat'} size={40} color={themeColors.stamp} />
            <Text kind="display" style={[styles.emptyTitle, { color: themeColors.ink }]}>
              {searchText ? 'Nothing charted' : 'No chats on the horizon'}
            </Text>
            <Text kind="hand" style={[styles.emptyHint, { color: themeColors.inkSoft }]}>
              {searchText ? 'Try another word' : 'Open the Add tab to start a chat or gather a crew'}
            </Text>
          </Paper>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={Gap}
        />
      )}
    </Page>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingTop: 8 },
  trail: { marginHorizontal: 18, marginTop: 2 },
  searchWrap: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 9 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  empty: { alignItems: 'center', gap: 6, paddingHorizontal: 26, paddingVertical: 14 },
  emptyTitle: { fontSize: 26, lineHeight: 32, textAlign: 'center' },
  emptyHint: { fontSize: 20, lineHeight: 24, textAlign: 'center' },
  list: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 28 },
  gap: { height: 12 },
  press: { paddingLeft: 4 },
  pressed: { opacity: 0.85, transform: [{ translateY: 1 }] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 12 },
  body: { flex: 1, gap: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 22, lineHeight: 26 },
  time: { fontSize: 18, lineHeight: 22 },
  preview: { flex: 1, fontSize: 15 },
});
