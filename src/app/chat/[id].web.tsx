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
  Image,
  Alert,
  Animated,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  StyleSheet,
  View,
  ViewToken,
} from 'react-native';
import { ART, Loading, NATIVE_DRIVER, PageTexture, POINTER, Text, TextInput, useDesktopLayout } from '../../components/parchment';
import { READING_WIDTH } from '../../theme/web';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ForwardPicker } from '../../components/chat/ForwardPicker';
import { GifPicker } from '../../components/chat/GifPicker';
import { GroupCallBar } from '../../components/chat/GroupCallBar';
import { GroupInfoModal } from '../../components/chat/GroupInfoModal';
import { MessageAction, MessageActionSheet } from '../../components/chat/MessageActionSheet';
import { DateSeparator, DayChip } from '../../components/chat/DateSeparator';
import { MessageBubble } from '../../components/chat/MessageBubble';
import { MessageInput } from '../../components/chat/MessageInput';
import { LocationShareSheet } from '../../components/chat/LocationShareSheet';
import { LocationViewer } from '../../components/chat/LocationViewer';
import { OfflineBanner } from '../../components/OfflineBanner';
import { useTheme } from '../../theme/mapTheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useToast } from '../../hooks/toastNotifications';
import { useActiveGroupCall } from '../../hooks/useActiveGroupCall';
import { useAuth } from '../../hooks/useAuth';
import { useConversations } from '../../hooks/useConversations';
import { useGifSender } from '../../hooks/useGifSender';
import { warmGifs } from '../../services/gifService';
import { useLiveShareIn } from '../../hooks/useLiveShares';
import { useTypingPeers, useTypingReporter } from '../../hooks/useTyping';
import { useMessages } from '../../hooks/useMessages';
import { useProfiles } from '../../hooks/useProfiles';
import { ReaderName, ReadBySheet } from '../../components/chat/ReadBySheet';
import { useIsOffline } from '../../hooks/useOnlineStatus';
import { useUserSettings } from '../../hooks/useUserSettings';
import { tickOnSend } from '../../services/alertSounds';
import * as chat from '../../services/chatService';
import {
  isBackgroundAllowed,
  requestBackgroundAccess,
  sendCurrentLocation,
  startLiveShare,
  stopLiveShare,
} from '../../services/liveLocationManager';
import { isCallingSupported } from '../../services/webrtc';
import { Timestamp } from 'firebase/firestore';
import { CallType, Conversation, Message, ReplyPreview } from '../../types';
import {
  getConversationSubtitle,
  getConversationTitle,
  getOtherParticipant,
  toMillis,
} from '../../utils/conversation';
import { dayHeaders, dayLabelsEach, floatingDayLabel } from '../../utils/dateLabels';
import { searchMessages } from '../../utils/messages';
import { latestSentId, MessageReceipts, Reader, receiptsFor } from '../../utils/receipts';
import { typingLabel } from '../../utils/typing';

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

/** A text message the server refused, kept on this phone so it can be shown with a red alert and tried again. */
interface FailedSend {
  message: Message;
  reply: ReplyPreview | null;
}

const failedMessage = (me: { uid: string; username: string }, text: string, reply: ReplyPreview | null): Message => ({
  id: `failed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type: 'text',
  text: text.trim(),
  senderId: me.uid,
  senderUsername: me.username,
  replyTo: reply ?? undefined,
  deletedFor: [],
  deletedForEveryone: false,
  createdAt: Timestamp.now(),
  pending: false,
  failed: true,
});

const toReplyPreview = (m: Message): ReplyPreview => ({
  messageId: m.id,
  senderId: m.senderId,
  senderUsername: m.senderUsername,
  type: m.type,
  text: chat.messagePreview(m.type, m.text) || m.text,
});

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
  // In a desktop browser window the list of chats is beside this page, so there is nothing to go back to.
  const { desktop } = useDesktopLayout();
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
  // "Read by" list (the people who have seen a message you sent), and messages the server refused.
  const [readersSheet, setReadersSheet] = useState<Reader[] | null>(null);
  const [failedSends, setFailedSends] = useState<FailedSend[]>([]);

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

  // Get the GIF picker ready while the chat opens: trending and its first pictures are downloaded now, so the picker has
  // GIFs on screen the moment it is opened. Once per ten minutes at most (services/gifService.ts).
  useEffect(() => {
    warmGifs();
  }, []);

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
    chat
      .markRead(conversation.id, myUid, { previousLog: conversation.readState?.[myUid]?.log, upTo: newestMs })
      .catch(() => {
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

  // While searching, only the matching messages are listed. They are grouped by day exactly like the full chat (a day chip
  // above the first match of each day, and the floating day chip while scrolling), because both read this same list.
  const allMessages = useMemo(
    () => (failedSends.length ? [...failedSends.map((f) => f.message).reverse(), ...messages] : messages),
    [failedSends, messages]
  );
  const visibleMessages = useMemo(
    () => (searchOpen ? searchMessages(allMessages, searchText) : allMessages),
    [allMessages, searchOpen, searchText]
  );

  // "Today" / "Yesterday" / "Saturday, 31 Oct" above the first message of each day. Drawn by the message itself, not as
  // extra list rows, so the list indexes that scroll-to-reply relies on stay as they are.
  const dayLabels = useMemo(
    () => dayHeaders(visibleMessages.map((m) => toMillis(m.createdAt))),
    [visibleMessages]
  );

  // The day being scrolled through, in a small chip at the top of the list that shows while you scroll and fades after.
  // The label of every message is kept in a ref because FlatList needs the viewability callback to stay the same function.
  const everyDayLabel = useMemo(
    () => dayLabelsEach(visibleMessages.map((m) => toMillis(m.createdAt))),
    [visibleMessages]
  );
  const everyDayLabelRef = useRef(everyDayLabel);
  everyDayLabelRef.current = everyDayLabel;
  const [floatingDay, setFloatingDay] = useState<string | null>(null);
  const chipOpacity = useRef(new Animated.Value(0)).current;
  const chipShown = useRef(false);
  const chipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 1 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const indexes = viewableItems.map((token) => token.index).filter((i): i is number => typeof i === 'number');
    const label = floatingDayLabel(indexes, everyDayLabelRef.current);
    setFloatingDay((previous) => (previous === label || label === null ? previous : label));
  }).current;
  const onListScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      // At the newest message (the bottom) there is nothing to point out.
      if (event.nativeEvent.contentOffset.y < 24) return;
      if (!chipShown.current) {
        chipShown.current = true;
        Animated.timing(chipOpacity, { toValue: 1, duration: 120, useNativeDriver: NATIVE_DRIVER }).start();
      }
      if (chipTimer.current) clearTimeout(chipTimer.current);
      chipTimer.current = setTimeout(() => {
        chipShown.current = false;
        Animated.timing(chipOpacity, { toValue: 0, duration: 300, useNativeDriver: NATIVE_DRIVER }).start();
      }, 1400);
    },
    [chipOpacity]
  );
  useEffect(
    () => () => {
      if (chipTimer.current) clearTimeout(chipTimer.current);
    },
    []
  );

  const forwardTargets = useMemo(
    () => conversations.filter((c) => c.id !== conversationId),
    [conversations, conversationId]
  );

  // ----- actions -----
  // Swiping a message to the right replies to it, the same as "Reply" in the long-press menu.
  const handleSwipeReply = useCallback((message: Message) => setReplyTo(toReplyPreview(message)), []);

  // Not awaited: while offline the write stays queued and the bubble shows as pending (NFR-07). If the server refuses it, the
  // message stays on screen with a red alert instead of vanishing, and can be tried again or deleted.
  const sendText = useCallback(
    (text: string, reply: ReplyPreview | null) => {
      if (!conversation || !me) return;
      chat.sendMessage(conversation, me, { type: 'text', text, replyTo: reply ?? undefined }).catch((e) => {
        setFailedSends((list) => [...list, { message: failedMessage(me, text, reply), reply }]);
        toast.error('Message not sent', errorText(e));
      });
    },
    [conversation, me, toast]
  );
  const handleSend = (text: string) => {
    if (!conversation || !me) return;
    typingReporter.stop();
    const reply = replyTo;
    setReplyTo(null);
    tickOnSend();
    sendText(text, reply);
  };
  const handleFailedPress = useCallback(
    (message: Message) => {
      const entry = failedSends.find((f) => f.message.id === message.id);
      const remove = () => setFailedSends((list) => list.filter((f) => f.message.id !== message.id));
      Alert.alert('Message not sent', 'The message could not be sent.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: remove },
        {
          text: 'Try again',
          onPress: () => {
            remove();
            sendText(message.text, entry?.reply ?? null);
          },
        },
      ]);
    },
    [failedSends, sendText]
  );
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

  // What happened to each message you sent (utils/receipts.ts). Equal results are reused as the same object so that a
  // receipt for one message does not redraw every other bubble.
  const receiptCache = useRef(new Map<string, MessageReceipts>());
  const receiptsOf = useCallback(
    (message: Message): MessageReceipts => {
      const next = receiptsFor(message, conversation?.participantIds, conversation?.readState);
      const key = `${next.state}|${next.recipients}|${next.readers.map((r) => `${r.uid}:${r.at}`).join(',')}`;
      const cache = receiptCache.current;
      const hit = cache.get(key);
      if (hit) return hit;
      if (cache.size > 300) cache.clear();
      cache.set(key, next);
      return next;
    },
    [conversation?.participantIds, conversation?.readState]
  );

  // Members' usernames (as saved in the chat) for the letters in the avatar queue.
  const members = conversation ? (conversation.isGroup ? conversation.participants ?? [] : [conversation.participant1, conversation.participant2]) : [];
  const memberKey = members.map((p) => `${p?.uid}:${p?.username}`).join('|');
  const memberNames = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of members) if (p) out[p.uid] = p.username;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberKey]);

  // The "Read by" list shows live usernames (and a display name when they have one), fetched only when it is opened.
  const readerUids = useMemo(() => readersSheet?.map((r) => r.uid) ?? [], [readersSheet]);
  const { usernameOf, displayNameOf } = useProfiles(readerUids);
  const readerName = useCallback(
    (uid: string): ReaderName => {
      const username = usernameOf(uid) ?? memberNames[uid] ?? 'Someone';
      const display = displayNameOf(uid);
      return { username, displayName: display && display !== username ? display : undefined };
    },
    [usernameOf, displayNameOf, memberNames]
  );
  const openReaders = useCallback((_message: Message, readers: Reader[]) => setReadersSheet(readers), []);

  // Only the newest message you sent shows the avatar queue. It is taken from the whole chat, not the search results.
  const latestSentMessageId = useMemo(() => latestSentId(allMessages, myUid), [allMessages, myUid]);

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const mine = item.senderId === myUid;
      const day = dayLabels[index];
      return (
        <View>
          {day ? <DateSeparator label={day} colors={themeColors} /> : null}
          <MessageBubble
            message={item}
            isMine={mine}
            receipts={mine ? receiptsOf(item) : undefined}
            names={memberNames}
            showSender={!!conversation?.isGroup}
            colors={themeColors}
            onLongPress={setActionMessage}
            onReplyPress={scrollToMessage}
            onSwipeReply={handleSwipeReply}
            onOpenLocation={setViewerMessage}
            latestSent={item.id === latestSentMessageId}
            onOpenReaders={openReaders}
            onRetry={handleFailedPress}
          />
        </View>
      );
    },
    [myUid, conversation, themeColors, scrollToMessage, handleSwipeReply, dayLabels, receiptsOf, memberNames, latestSentMessageId, openReaders, handleFailedPress]
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: desktop ? 'transparent' : themeColors.background }]}
      behavior="padding"
    >
      <PageTexture variant="plain" />
      {/* Header: a strip of ship's planking with a brass rail along its edge */}
      <View style={[styles.headerWrap, { backgroundColor: themeColors.wood, paddingTop: insets.top }]}>
        <Image source={ART.wood} resizeMode="cover" style={StyleSheet.absoluteFill} />
        <View style={styles.header}>
          {desktop ? null : (
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back" style={POINTER}>
              <Ionicons name="arrow-back" size={24} color={themeColors.buttonText} />
            </Pressable>
          )}
          <Pressable
            style={[styles.headerInfo, conversation?.isGroup ? POINTER : null]}
            disabled={!conversation?.isGroup}
            onPress={() => setGroupInfoOpen(true)}
            accessibilityLabel={conversation?.isGroup ? 'Group info' : undefined}
          >
            <Text kind="display" style={[styles.headerTitle, { color: themeColors.gilt }]} numberOfLines={1}>
              {title}
            </Text>
            {typingText ? (
              <Text
                kind="hand"
                style={[styles.headerSubtitle, { color: themeColors.gilt }]}
                numberOfLines={1}
                accessibilityLiveRegion="polite"
              >
                {typingText}
              </Text>
            ) : subtitle ? (
              <Text kind="hand" style={[styles.headerSubtitle, { color: themeColors.buttonText }]}>
                {subtitle} - tap for info
              </Text>
            ) : null}
          </Pressable>
          {callee && (
            <>
              <Pressable onPress={() => startCall('audio')} hitSlop={10} accessibilityLabel="Voice call" style={POINTER}>
                <Ionicons name="call-outline" size={22} color={themeColors.buttonText} />
              </Pressable>
              <Pressable onPress={() => startCall('video')} hitSlop={10} accessibilityLabel="Video call" style={POINTER}>
                <Ionicons name="videocam-outline" size={24} color={themeColors.buttonText} />
              </Pressable>
            </>
          )}
          {conversation?.isGroup && (
            <>
              <Pressable
                onPress={() => startOrJoinGroupCall('audio')}
                hitSlop={10}
                accessibilityLabel="Group voice call"
                style={POINTER}
              >
                <Ionicons name="call-outline" size={22} color={themeColors.buttonText} />
              </Pressable>
              <Pressable
                onPress={() => startOrJoinGroupCall('video')}
                hitSlop={10}
                accessibilityLabel="Group video call"
                style={POINTER}
              >
                <Ionicons name="videocam-outline" size={24} color={themeColors.buttonText} />
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
            style={POINTER}
          >
            <Ionicons name={searchOpen ? 'close' : 'search'} size={22} color={themeColors.buttonText} />
          </Pressable>
          <Pressable onPress={handleToggleMute} hitSlop={10} accessibilityLabel="Mute notifications" style={POINTER}>
            <Ionicons
              name={muted ? 'notifications-off' : 'notifications-outline'}
              size={22}
              color={muted ? themeColors.gilt : themeColors.buttonText}
            />
          </Pressable>
        </View>
        <View style={[styles.rail, { backgroundColor: themeColors.brass }]} />
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
          <Loading label="Hauling in the messages..." />
        </View>
      ) : (
        <View style={styles.listArea}>
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
            onScroll={onListScroll}
            scrollEventThrottle={100}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            onScrollToIndexFailed={() => toast.info('Original message is not loaded')}
            ListEmptyComponent={
              <View style={[styles.center, styles.flipped]}>
                <Text kind="hand" style={{ color: themeColors.subText, fontSize: 21, lineHeight: 26 }}>
                  {searchOpen && searchText ? 'No matching messages' : 'No messages yet. Say hello!'}
                </Text>
              </View>
            }
          />
          {floatingDay ? (
            <Animated.View pointerEvents="none" style={[styles.floatingDay, { opacity: chipOpacity }]}>
              <DayChip label={floatingDay} colors={themeColors} />
            </Animated.View>
          ) : null}
        </View>
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
          <Loading size={28} />
        </View>
      )}

      <ReadBySheet readers={readersSheet} nameOf={readerName} colors={themeColors} onClose={() => setReadersSheet(null)} />
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
  headerWrap: { overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rail: { height: 3 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 24, lineHeight: 28 },
  headerSubtitle: { fontSize: 16, lineHeight: 18 },
  searchBar: { padding: 8, borderBottomWidth: 1 },
  shareBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  shareBannerText: { flex: 1, fontSize: 14, fontWeight: '600' },
  shareBannerStop: { fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  searchInput: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6, fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flipped: { transform: [{ scaleY: -1 }] },
  // Lines of text stay a readable length on a wide window: the column of messages is centred and never wider than this.
  list: { paddingVertical: 8, width: '100%', maxWidth: READING_WIDTH, alignSelf: 'center' },
  listArea: { flex: 1 },
  floatingDay: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
  connecting: { alignItems: 'center', paddingTop: 12 },
});
