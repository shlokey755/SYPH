/**
 * (tabs)/index.tsx - Chat tab
 * Recent 1-on-1 and group conversations with search, unread counts and mute indicators.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/themeContext';
import { useToast } from '../../hooks/toastNotifications';
import { useAuth } from '../../hooks/useAuth';
import { useConversations } from '../../hooks/useConversations';
import { useProfileImages } from '../../hooks/useProfileImages';
import { useUserSettings } from '../../hooks/useUserSettings';
import { Conversation } from '../../types';
import {
  formatListTime,
  getConversationTitle,
  getOtherParticipant,
} from '../../utils/conversation';

export default function ChatTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { currentUser } = useAuth();
  const { themeColors } = useTheme();
  const { conversations, isLoading, deleteConversation } = useConversations();
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
  const photoOf = useProfileImages(otherUids);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        getConversationTitle(c, myUid).toLowerCase().includes(q) ||
        (c.lastMessage ?? '').toLowerCase().includes(q)
    );
  }, [conversations, searchText, myUid]);

  const openChat = (id: string) => router.push({ pathname: '/chat/[id]', params: { id } });

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
    const title = getConversationTitle(item, myUid);
    const other = getOtherParticipant(item, myUid);
    const unread = myUid ? (item.unread?.[myUid] ?? 0) : 0;
    const muted = isMuted(item.id);
    const mine = item.lastMessageSenderId === myUid;
    const prefix = mine ? 'You: ' : item.isGroup && item.lastMessageSenderName ? `${item.lastMessageSenderName}: ` : '';

    return (
      <Pressable
        onPress={() => openChat(item.id)}
        onLongPress={() => confirmDelete(item)}
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: themeColors.border },
          pressed && { backgroundColor: themeColors.cardBackground },
        ]}
      >
        {photoOf(other?.uid) || other?.profileImageUrl ? (
          <Image source={{ uri: photoOf(other?.uid) || other?.profileImageUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: themeColors.accent }]}>
            {item.isGroup ? (
              <Ionicons name="people" size={22} color={themeColors.buttonText} />
            ) : (
              <Text style={[styles.avatarText, { color: themeColors.buttonText }]}>
                {title[0]?.toUpperCase() ?? '?'}
              </Text>
            )}
          </View>
        )}

        <View style={styles.body}>
          <View style={styles.line}>
            <Text
              style={[styles.title, { color: themeColors.text }, unread > 0 && styles.bold]}
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text style={[styles.time, { color: unread > 0 ? themeColors.accent : themeColors.subText }]}>
              {formatListTime(item.lastMessageTime ?? null)}
            </Text>
          </View>
          <View style={styles.line}>
            <Text
              style={[styles.preview, { color: themeColors.subText }, unread > 0 && { color: themeColors.text }]}
              numberOfLines={1}
            >
              {item.lastMessage ? `${prefix}${item.lastMessage}` : 'No messages yet'}
            </Text>
            {muted && <Ionicons name="notifications-off" size={14} color={themeColors.subText} />}
            {unread > 0 && (
              <View style={[styles.badge, { backgroundColor: themeColors.accent }]}>
                <Text style={[styles.badgeText, { color: themeColors.buttonText }]}>
                  {unread > 99 ? '99+' : unread}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Chats</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={themeColors.subText} style={styles.searchIcon} />
        <TextInput
          style={[
            styles.search,
            { backgroundColor: themeColors.inputBg, color: themeColors.text, borderColor: themeColors.border },
          ]}
          placeholder="Search chats"
          placeholderTextColor={themeColors.subText}
          value={searchText}
          onChangeText={setSearchText}
          autoCapitalize="none"
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={48} color={themeColors.subText} />
          <Text style={[styles.emptyTitle, { color: themeColors.subText }]}>
            {searchText ? 'No chats match your search' : 'No conversations yet'}
          </Text>
          {!searchText && (
            <Text style={[styles.emptyHint, { color: themeColors.subText }]}>
              Use the Add tab to start a chat or create a group
            </Text>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 26, fontWeight: '800' },
  searchWrap: { paddingHorizontal: 12, paddingBottom: 8, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 24, zIndex: 1, top: 11 },
  search: { borderRadius: 20, borderWidth: 1, paddingLeft: 38, paddingRight: 14, paddingVertical: 8, fontSize: 15 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 16 },
  emptyHint: { fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700' },
  body: { flex: 1, gap: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '600' },
  bold: { fontWeight: '800' },
  time: { fontSize: 12 },
  preview: { flex: 1, fontSize: 14 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
