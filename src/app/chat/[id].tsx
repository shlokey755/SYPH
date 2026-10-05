/**
 * app/chat/[id].tsx
 * Conversation screen for 1-on-1 and group chats.
 * Covers FR-03/05 (text), FR-07 (delivery + read status), FR-08 (reply, forward, delete, copy),
 * FR-11 (search inside a chat) and FR-12 (mute).
 */

import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ForwardPicker } from '../../components/chat/ForwardPicker';
import { MessageAction, MessageActionSheet } from '../../components/chat/MessageActionSheet';
import { MessageBubble } from '../../components/chat/MessageBubble';
import { MessageInput } from '../../components/chat/MessageInput';
import { useTheme } from '../../hooks/themeContext';
import { useToast } from '../../hooks/toastNotifications';
import { useAuth } from '../../hooks/useAuth';
import { useConversations } from '../../hooks/useConversations';
import { useMessages } from '../../hooks/useMessages';
import { useUserSettings } from '../../hooks/useUserSettings';
import * as chat from '../../services/chatService';
import { Conversation, Message, ReplyPreview } from '../../types';
import {
  getConversationSubtitle,
  getConversationTitle,
  toMillis,
} from '../../utils/conversation';
import { getMessageStatus } from '../../utils/messageStatus';

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

function useAppIsActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

export default function ChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { themeColors } = useTheme();
  const { currentUser } = useAuth();
  const toast = useToast();
  const { conversations, getConversation, setActiveChat } = useConversations();
  const { isMuted, toggleMute } = useUserSettings();

  const myUid = currentUser?.uid;
  const conversation = conversationId ? getConversation(conversationId) : undefined;
  const { messages, isLoading, loadMore } = useMessages(conversationId, myUid);

  const listRef = useRef<FlatList<Message>>(null);
  const [focused, setFocused] = useState(true);
  const appActive = useAppIsActive();

  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');

  const me = useMemo(
    () => (currentUser ? { uid: currentUser.uid, username: currentUser.username } : null),
    [currentUser]
  );

  // Tell the conversations provider which chat is open (suppresses its toasts).
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      if (conversationId) setActiveChat(conversationId);
      return () => {
        setFocused(false);
        setActiveChat(null);
      };
    }, [conversationId, setActiveChat])
  );

  // Read receipts: mark the chat read while it is on screen and the app is in the foreground.
  const readKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversation || !myUid || !focused || !appActive) return;
    const newestIncoming = messages.find((m) => m.senderId !== myUid && !m.pending);
    const newestMs = toMillis(newestIncoming?.createdAt);
    const myReadAt = toMillis(conversation.readState?.[myUid]?.readAt);
    const unread = conversation.unread?.[myUid] ?? 0;
    if (!(newestMs > myReadAt) && unread === 0) return;

    const key = `${conversation.id}:${newestMs}:${unread}`;
    if (readKeyRef.current === key) return;
    readKeyRef.current = key;
    chat.markRead(conversation.id, myUid).catch(() => {
      readKeyRef.current = null;
    });
  }, [messages, conversation, myUid, focused, appActive]);

  // ----- derived data -----
  const title = conversation ? getConversationTitle(conversation, myUid) : 'Chat';
  const subtitle = conversation ? getConversationSubtitle(conversation) : '';
  const muted = conversationId ? isMuted(conversationId) : false;

  const visibleMessages = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!searchOpen || !q) return messages;
    return messages.filter((m) => !m.deletedForEveryone && m.text.toLowerCase().includes(q));
  }, [messages, searchOpen, searchText]);

  const forwardTargets = useMemo(
    () => conversations.filter((c) => c.id !== conversationId),
    [conversations, conversationId]
  );

  // ----- actions -----
  const toReplyPreview = (m: Message): ReplyPreview => ({
    messageId: m.id,
    senderId: m.senderId,
    senderUsername: m.senderUsername,
    type: m.type,
    text: chat.messagePreview(m.type, m.text) || m.text,
  });

  const handleSend = (text: string) => {
    if (!conversation || !me) return;
    const reply = replyTo;
    setReplyTo(null);
    // Not awaited: while offline the write stays queued and the bubble shows as pending (NFR-07).
    chat
      .sendMessage(conversation, me, { type: 'text', text, replyTo: reply ?? undefined })
      .catch((e) => toast.error('Message not sent', errorText(e)));
  };

  const handleAction = async (action: MessageAction, message: Message) => {
    setActionMessage(null);
    if (!conversationId || !myUid) return;
    try {
      switch (action) {
        case 'reply':
          setReplyTo(toReplyPreview(message));
          break;
        case 'copy':
          await Clipboard.setStringAsync(message.text);
          toast.success('Copied');
          break;
        case 'forward':
          setForwardMessage(message);
          break;
        case 'deleteForMe':
          await chat.deleteMessageForMe(conversationId, message.id, myUid);
          break;
        case 'deleteForEveryone':
          Alert.alert('Delete for everyone?', 'This message will be removed for all members.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () =>
                chat
                  .deleteMessageForEveryone(conversationId, message.id)
                  .catch((e) => toast.error('Could not delete', errorText(e))),
            },
          ]);
          break;
      }
    } catch (e) {
      toast.error('Action failed', errorText(e));
    }
  };

  const handleForward = async (target: Conversation) => {
    const original = forwardMessage;
    setForwardMessage(null);
    if (!original || !me) return;
    try {
      await chat.forwardMessage(target, me, {
        type: original.type,
        text: original.text,
        media: original.media,
      });
      toast.success('Forwarded', `Sent to ${getConversationTitle(target, myUid)}`);
    } catch (e) {
      toast.error('Could not forward', errorText(e));
    }
  };

  const handleToggleMute = async () => {
    if (!conversationId) return;
    try {
      await toggleMute(conversationId);
      toast.info(muted ? 'Notifications on' : 'Chat muted');
    } catch (e) {
      toast.error('Could not update mute', errorText(e));
    }
  };

  const scrollToMessage = useCallback(
    (messageId: string) => {
      const index = visibleMessages.findIndex((m) => m.id === messageId);
      if (index < 0) {
        toast.info('Original message is not loaded');
        return;
      }
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    },
    [visibleMessages, toast]
  );

  const renderItem = useCallback(
    ({ item }: { item: Message }) => {
      const mine = item.senderId === myUid;
      return (
        <MessageBubble
          message={item}
          isMine={mine}
          status={mine ? getMessageStatus(item, conversation) : undefined}
          showSender={!!conversation?.isGroup}
          colors={themeColors}
          onLongPress={setActionMessage}
          onReplyPress={scrollToMessage}
        />
      );
    },
    [myUid, conversation, themeColors, scrollToMessage]
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.background, paddingTop: insets.top }]}
      behavior="padding"
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.headerSubtitle, { color: themeColors.subText }]}>{subtitle}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => {
            setSearchOpen((open) => !open);
            setSearchText('');
          }}
          hitSlop={10}
          accessibilityLabel="Search in chat"
        >
          <Ionicons name={searchOpen ? 'close' : 'search'} size={22} color={themeColors.text} />
        </Pressable>
        <Pressable onPress={handleToggleMute} hitSlop={10} accessibilityLabel="Mute notifications">
          <Ionicons
            name={muted ? 'notifications-off' : 'notifications-outline'}
            size={22}
            color={muted ? themeColors.accent : themeColors.text}
          />
        </Pressable>
      </View>

      {searchOpen && (
        <View style={[styles.searchBar, { borderBottomColor: themeColors.border }]}>
          <TextInput
            autoFocus
            style={[
              styles.searchInput,
              { backgroundColor: themeColors.inputBg, color: themeColors.text, borderColor: themeColors.border },
            ]}
            placeholder="Search messages"
            placeholderTextColor={themeColors.subText}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
      )}

      {/* Messages */}
      {isLoading && messages.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={visibleMessages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          inverted
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          initialNumToRender={20}
          contentContainerStyle={styles.list}
          onScrollToIndexFailed={() => toast.info('Original message is not loaded')}
          ListEmptyComponent={
            <View style={[styles.center, styles.flipped]}>
              <Text style={{ color: themeColors.subText }}>
                {searchOpen && searchText ? 'No matching messages' : 'No messages yet. Say hello!'}
              </Text>
            </View>
          }
        />
      )}

      {/* Composer */}
      {conversation ? (
        <MessageInput
          colors={themeColors}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={handleSend}
        />
      ) : (
        <View style={[styles.connecting, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <ActivityIndicator color={themeColors.accent} />
        </View>
      )}

      <MessageActionSheet
        message={actionMessage}
        isMine={actionMessage?.senderId === myUid}
        colors={themeColors}
        onSelect={handleAction}
        onClose={() => setActionMessage(null)}
      />
      <ForwardPicker
        visible={!!forwardMessage}
        conversations={forwardTargets}
        myUid={myUid}
        colors={themeColors}
        onPick={handleForward}
        onClose={() => setForwardMessage(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSubtitle: { fontSize: 12, marginTop: 1 },
  searchBar: { padding: 8, borderBottomWidth: 1 },
  searchInput: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6, fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flipped: { transform: [{ scaleY: -1 }] },
  list: { paddingVertical: 8 },
  connecting: { alignItems: 'center', paddingTop: 12 },
});
