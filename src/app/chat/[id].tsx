/**
 * app/chat/[id].tsx
 * Conversation screen for 1-on-1 and group chats.
 * Covers FR-03/05 (text), FR-07 (delivery + read status), FR-08 (reply, forward, delete, copy),
 * FR-11 (search inside a chat), FR-12 (mute) and live location sharing.
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
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ForwardPicker } from '../../components/chat/ForwardPicker';
import { GifPicker } from '../../components/chat/GifPicker';
import { GroupCallBar } from '../../components/chat/GroupCallBar';
import { GroupInfoModal } from '../../components/chat/GroupInfoModal';
import { MessageAction, MessageActionSheet } from '../../components/chat/MessageActionSheet';
import { MessageBubble } from '../../components/chat/MessageBubble';
import { MessageInput } from '../../components/chat/MessageInput';
import { LocationShareSheet } from '../../components/chat/LocationShareSheet';
import { LocationViewer } from '../../components/chat/LocationViewer';
import { OfflineBanner } from '../../components/OfflineBanner';
import { useTheme } from '../../hooks/themeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useToast } from '../../hooks/toastNotifications';
import { useActiveGroupCall } from '../../hooks/useActiveGroupCall';
import { useAuth } from '../../hooks/useAuth';
import { useConversations } from '../../hooks/useConversations';
import { useGifSender } from '../../hooks/useGifSender';
import { useLiveShareIn } from '../../hooks/useLiveShares';
import { useTypingPeers, useTypingReporter } from '../../hooks/useTyping';
import { useMessages } from '../../hooks/useMessages';
import { useProfiles } from '../../hooks/useProfiles';
import { useIsOffline } from '../../hooks/useOnlineStatus';
import { useUserSettings } from '../../hooks/useUserSettings';
import * as chat from '../../services/chatService';
import {
  isBackgroundAllowed,
  requestBackgroundAccess,
  sendCurrentLocation,
  startLiveShare,
  stopLiveShare,
} from '../../services/liveLocationManager';
import { isCallingSupported } from '../../services/webrtc';
import { CallType, Conversation, Message, ReplyPreview } from '../../types';
import {
  getConversationSubtitle,
  getConversationTitle,
  getOtherParticipant,
  toMillis,
} from '../../utils/conversation';
import { getMessageStatus } from '../../utils/messageStatus';
import { typingLabel } from '../../utils/typing';

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

function useAppIsActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

const HINT_KEY = 'syph.hint.holdSendForLocation';
const BACKGROUND_ASKED_KEY = 'syph.hint.backgroundLocationAsked';

export default function ChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { themeColors } = useTheme();
  const { currentUser } = useAuth();
  const toast = useToast();
  const { conversations, getConversation, setActiveChat } = useConversations();
  const { isMuted, toggleMute } = useUserSettings();
  const offline = useIsOffline();

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
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState<'none' | 'pin' | 'live'>('none');
  const [backgroundOn, setBackgroundOn] = useState(false);
  const [viewerMessage, setViewerMessage] = useState<Message | null>(null);

  const me = useMemo(
    () => (currentUser ? { uid: currentUser.uid, username: currentUser.username } : null),
    [currentUser]
  );

  const sender = useGifSender({
    conversation,
    me,
    replyTo,
    onReplyConsumed: () => setReplyTo(null),
  });

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
  const otherUidList = useMemo(() => {
    const other = conversation && !conversation.isGroup ? getOtherParticipant(conversation, myUid)?.uid : undefined;
    return other ? [other] : [];
  }, [conversation, myUid]);
  const { nameOf } = useProfiles(otherUidList); // the other person's current name, not the one saved when the chat began
  const title = conversation ? getConversationTitle(conversation, myUid, nameOf) : 'Chat';
  const subtitle = conversation ? getConversationSubtitle(conversation) : '';
  const muted = conversationId ? isMuted(conversationId) : false;

  // "typing…": others are shown while this chat is on screen and online; your own typing is reported under the same rule.
  const typingEnabled = !!conversation && !offline && focused && appActive;
  const typingUids = useTypingPeers(conversationId, myUid, typingEnabled);
  const typingReporter = useTypingReporter(conversationId, myUid, typingEnabled);
  const typingText = typingLabel(
    typingUids.map(
      (uid) => nameOf(uid) ?? conversation?.participants?.find((p) => p.uid === uid)?.username ?? 'Someone'
    ),
    !!conversation?.isGroup
  );

  // Group calls: is one going that this person can join?
  const groupCall = useActiveGroupCall(conversation);

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
    typingReporter.stop();
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
              onPress: () => {
                (async () => {
                  // A live location stops first, so deleting its message never leaves a position being broadcast.
                  if (message.type === 'location') await stopLiveShare(message.id);
                  await chat.deleteMessageForEveryone(conversationId, message.id);
                })().catch((e) => toast.error('Could not delete', errorText(e)));
              },
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
      toast.success('Forwarded', `Sent to ${getConversationTitle(target, myUid, nameOf)}`);
    } catch (e) {
      toast.error('Could not forward', errorText(e));
    }
  };

  // ----- live location -----
  const myShare = useLiveShareIn(conversationId);
  const shareAudience = conversation?.isGroup ? 'Everyone in this group' : title;

  /** Explains why, then opens the system page where "Allow all the time" is chosen (Android 11 and later). */
  const askBackground = () => {
    Alert.alert(
      'Keep sharing when SYPH is closed?',
      'To keep your live location updating with SYPH in the background, choose "Allow all the time" on the next screen. ' +
        'While you share, a notification stays visible. Stop sharing any time from the chat.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            const access = await requestBackgroundAccess();
            setBackgroundOn(access === 'granted');
          },
        },
      ]
    );
  };

  // Checked each time the popup opens, since the person may have changed it in Settings.
  useEffect(() => {
    if (locationSheetOpen) void isBackgroundAllowed().then(setBackgroundOn);
  }, [locationSheetOpen]);

  /** Tells the person why a location could not be read or sent. Returns true when the message was handled. */
  const explainLocationFailure = (reason: string, message?: string) => {
    switch (reason) {
      case 'permission-blocked':
        setLocationSheetOpen(false);
        Alert.alert('Location is off for SYPH', 'Turn it on in Settings to share your location.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ]);
        break;
      case 'permission-denied':
        toast.error('Location permission needed', 'Allow location access to share where you are');
        break;
      case 'no-position':
        toast.error('Could not find your location', 'Check that location is turned on and try again');
        break;
      default:
        toast.error('Could not share', message === 'timeout' ? 'The connection is too slow. Try again.' : message ?? 'Try again');
    }
  };

  const handleSendCurrent = async () => {
    if (!conversation || !me) return;
    if (offline) {
      toast.error("You're offline", 'Connect to the internet to share your location');
      return;
    }
    setShareBusy('pin');
    const result = await sendCurrentLocation({ conversation, sender: me });
    setShareBusy('none');
    if (result.ok) {
      setLocationSheetOpen(false);
      toast.success('Location sent');
      return;
    }
    explainLocationFailure(result.reason, result.message);
  };

  const handleStartShare = async (durationMs: number) => {
    if (!conversation || !me) return;
    if (offline) {
      toast.error("You're offline", 'Connect to the internet to share your live location');
      return;
    }
    setShareBusy('live');
    const result = await startLiveShare({ conversation, sender: me, durationMs });
    setShareBusy('none');
    if (!result.ok) {
      explainLocationFailure(result.reason, result.message);
      return;
    }
    setLocationSheetOpen(false);
    if (await isBackgroundAllowed()) {
      toast.success('Sharing your live location', 'It keeps updating when SYPH is in the background');
    } else {
      toast.success('Sharing your live location', 'Keep SYPH open so it stays up to date');
      // Offered once; the popup keeps a "Keep it going" link for later.
      if (!(await AsyncStorage.getItem(BACKGROUND_ASKED_KEY).catch(() => 'x'))) {
        void AsyncStorage.setItem(BACKGROUND_ASKED_KEY, '1').catch(() => {});
        askBackground();
      }
    }
  };

  const handleStopShare = (shareId: string) => {
    setLocationSheetOpen(false);
    void stopLiveShare(shareId);
    toast.info('Stopped sharing your location');
  };

  // A hold on the send button is easy to miss, so say so once.
  useEffect(() => {
    AsyncStorage.getItem(HINT_KEY)
      .then((seen) => {
        if (seen) return;
        void AsyncStorage.setItem(HINT_KEY, '1').catch(() => {});
        toast.info('Tip', 'Hold the send button to share your location');
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 1-on-1 chats call the other person (below); group chats use startOrJoinGroupCall.
  const callee = conversation && !conversation.isGroup ? getOtherParticipant(conversation, myUid) : undefined;

  const startCall = (type: CallType) => {
    if (!conversation || !callee) return;
    if (!isCallingSupported()) {
      toast.info('Calls need an installed build', 'They do not work in Expo Go. See API.md for the development build.');
      return;
    }
    if (offline) {
      toast.error("You're offline", 'Connect to the internet to place a call');
      return;
    }
    router.push({
      pathname: '/call/[id]',
      params: {
        id: 'new',
        conversationId: conversation.id,
        type,
        calleeId: callee.uid,
        calleeName: callee.username,
      },
    });
  };

  /** Group chats: join the call that is going, or start a new one. */
  const startOrJoinGroupCall = (type: CallType) => {
    if (!conversation?.isGroup) return;
    if (!isCallingSupported()) {
      toast.info('Calls need an installed build', 'They do not work in Expo Go. See API.md for the development build.');
      return;
    }
    if (offline) {
      toast.error("You're offline", 'Connect to the internet to join a call');
      return;
    }
    const live = groupCall.call;
    router.push({
      pathname: '/group-call/[id]',
      params: live
        ? { id: live.id, conversationId: conversation.id, type: live.type }
        : { id: 'new', conversationId: conversation.id, type },
    });
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
          onOpenLocation={setViewerMessage}
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
        <Pressable
          style={styles.headerInfo}
          disabled={!conversation?.isGroup}
          onPress={() => setGroupInfoOpen(true)}
          accessibilityLabel={conversation?.isGroup ? 'Group info' : undefined}
        >
          <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {typingText ? (
            <Text
              style={[styles.headerSubtitle, { color: themeColors.accent }]}
              numberOfLines={1}
              accessibilityLiveRegion="polite"
            >
              {typingText}
            </Text>
          ) : subtitle ? (
            <Text style={[styles.headerSubtitle, { color: themeColors.subText }]}>
              {subtitle} - tap for info
            </Text>
          ) : null}
        </Pressable>
        {callee && (
          <>
            <Pressable onPress={() => startCall('audio')} hitSlop={10} accessibilityLabel="Voice call">
              <Ionicons name="call-outline" size={22} color={themeColors.text} />
            </Pressable>
            <Pressable onPress={() => startCall('video')} hitSlop={10} accessibilityLabel="Video call">
              <Ionicons name="videocam-outline" size={24} color={themeColors.text} />
            </Pressable>
          </>
        )}
        {conversation?.isGroup && (
          <>
            <Pressable onPress={() => startOrJoinGroupCall('audio')} hitSlop={10} accessibilityLabel="Group voice call">
              <Ionicons name="call-outline" size={22} color={themeColors.text} />
            </Pressable>
            <Pressable onPress={() => startOrJoinGroupCall('video')} hitSlop={10} accessibilityLabel="Group video call">
              <Ionicons name="videocam-outline" size={24} color={themeColors.text} />
            </Pressable>
          </>
        )}
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

      <OfflineBanner message="You're offline. Messages you send now are sent when you reconnect." />

      {groupCall.showBar && groupCall.call && (
        <GroupCallBar
          type={groupCall.call.type}
          count={groupCall.peersPresent}
          colors={themeColors}
          onJoin={() => startOrJoinGroupCall(groupCall.call!.type)}
        />
      )}
      {myShare && (
        <View style={[styles.shareBanner, { backgroundColor: themeColors.accent }]}>
          <Ionicons name="location" size={16} color={themeColors.buttonText} />
          <Text style={[styles.shareBannerText, { color: themeColors.buttonText }]} numberOfLines={1}>
            Sharing your live location
          </Text>
          <Pressable
            onPress={() => handleStopShare(myShare.id)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Stop sharing live location"
          >
            <Text style={[styles.shareBannerStop, { color: themeColors.buttonText }]}>Stop</Text>
          </Pressable>
        </View>
      )}

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
          onTextChange={typingReporter.onTextChange}
          onOpenLocation={() => setLocationSheetOpen(true)}
          onOpenGif={() => setGifOpen(true)}
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
      <LocationShareSheet
        visible={locationSheetOpen}
        colors={themeColors}
        activeShare={myShare}
        busy={shareBusy}
        audience={shareAudience}
        backgroundOn={backgroundOn}
        onSendCurrent={handleSendCurrent}
        onStartLive={handleStartShare}
        onEnableBackground={askBackground}
        onStop={() => myShare && handleStopShare(myShare.id)}
        onClose={() => setLocationSheetOpen(false)}
      />
      <LocationViewer
        conversationId={conversationId ?? ''}
        message={viewerMessage}
        sharerName={viewerMessage ? nameOf(viewerMessage.senderId) ?? viewerMessage.senderUsername : ''}
        isMine={viewerMessage?.senderId === myUid}
        colors={themeColors}
        onStop={(message) => {
          void stopLiveShare(message.id);
          toast.info('Stopped sharing your location');
        }}
        onClose={() => setViewerMessage(null)}
      />
      <GifPicker
        visible={gifOpen}
        colors={themeColors}
        onPick={(url, width, height) => {
          setGifOpen(false);
          sender.sendGif(url, width, height);
        }}
        onClose={() => setGifOpen(false)}
      />
      <GroupInfoModal
        visible={groupInfoOpen}
        conversation={conversation}
        myUid={myUid}
        colors={themeColors}
        onClose={() => setGroupInfoOpen(false)}
        onLeft={() => router.replace('/(tabs)')}
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
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSubtitle: { fontSize: 12, marginTop: 1 },
  searchBar: { padding: 8, borderBottomWidth: 1 },
  shareBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  shareBannerText: { flex: 1, fontSize: 14, fontWeight: '600' },
  shareBannerStop: { fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  searchInput: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6, fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flipped: { transform: [{ scaleY: -1 }] },
  list: { paddingVertical: 8 },
  connecting: { alignItems: 'center', paddingTop: 12 },
});
