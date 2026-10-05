/**
 * useConversations.tsx
 * One shared, targeted listener for the signed-in user's conversations.
 *
 * - Queries only conversations the user belongs to (participantIds array-contains uid).
 *   The previous version downloaded every conversation in the database and filtered on the device.
 * - Records delivery receipts for messages that arrive while the app is open (FR-07).
 * - Shows an in-app toast for messages in chats that are not open and not muted (FR-09).
 */

import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { db } from '../firebaseConfig';
import * as chat from '../services/chatService';
import { Conversation } from '../types';
import { useToast } from './toastNotifications';
import { useAuth } from './useAuth';
import { useUserSettings } from './useUserSettings';

type MemberInput = { uid: string; username: string; profileImageUrl?: string };

interface ConversationsContextType {
  /** Visible conversations (not hidden by this user), newest activity first. */
  conversations: Conversation[];
  isLoading: boolean;
  unreadTotal: number;
  getConversation: (id: string) => Conversation | undefined;
  /** The chat screen registers itself so we do not toast about the chat you are reading. */
  setActiveChat: (id: string | null) => void;
  getOrCreateConversation: (
    currentUserId: string,
    otherUserId: string,
    otherUsername: string,
    otherProfileImage?: string,
    currentUsername?: string
  ) => Promise<string>;
  createGroupConversation: (
    currentUserId: string,
    selectedUsers: MemberInput[],
    currentUsername: string,
    groupName?: string
  ) => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
}

const ConversationsContext = createContext<ConversationsContextType | undefined>(undefined);

const activityMillis = (c: Conversation) =>
  c.lastMessageTime?.toMillis?.() ?? c.createdAt?.toMillis?.() ?? 0;

export const ConversationsProvider = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const toast = useToast();
  const router = useRouter();
  const { isMuted } = useUserSettings();

  const [all, setAll] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const activeChatRef = useRef<string | null>(null);
  const lastSeenRef = useRef<Record<string, number>>({});
  const deliveredRef = useRef<Set<string>>(new Set());
  // Latest callbacks, so the Firestore listener does not resubscribe when they change.
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    lastSeenRef.current = {};
    deliveredRef.current = new Set();

    if (!uid) {
      setAll([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let firstSnapshot = true;

    const q = query(collection(db, 'conversations'), where('participantIds', 'array-contains', uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') return;
          const conv = {
            ...change.doc.data({ serverTimestamps: 'estimate' }),
            id: change.doc.id,
          } as Conversation;

          const millis = conv.lastMessageTime?.toMillis?.() ?? 0;
          const previous = lastSeenRef.current[conv.id] ?? 0;
          lastSeenRef.current[conv.id] = millis;

          const fromSomeoneElse = !!conv.lastMessageSenderId && conv.lastMessageSenderId !== uid;
          if (!fromSomeoneElse || !millis || change.doc.metadata.hasPendingWrites) return;

          // Delivery receipt: this device has the message.
          const deliveredAt = conv.readState?.[uid]?.deliveredAt?.toMillis?.() ?? 0;
          const deliveredKey = `${conv.id}:${millis}`;
          if (millis > deliveredAt && !deliveredRef.current.has(deliveredKey)) {
            deliveredRef.current.add(deliveredKey);
            chat.markDelivered(conv.id, uid).catch(() => deliveredRef.current.delete(deliveredKey));
          }

          // In-app toast for new messages in other chats.
          if (
            !firstSnapshot &&
            millis > previous &&
            activeChatRef.current !== conv.id &&
            !isMutedRef.current(conv.id)
          ) {
            const sender = conv.lastMessageSenderName || 'New message';
            toastRef.current.show({
              type: 'message',
              title: conv.isGroup ? `${conv.groupName ?? 'Group'}` : sender,
              message: conv.isGroup ? `${sender}: ${conv.lastMessage ?? ''}` : conv.lastMessage,
              onPress: () =>
                routerRef.current.push({ pathname: '/chat/[id]', params: { id: conv.id } }),
            });
          }
        });

        firstSnapshot = false;
        setAll(
          snapshot.docs.map(
            (d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }) as Conversation
          )
        );
        setIsLoading(false);
      },
      (error) => {
        console.error('Error listening to conversations:', error);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [uid]);

  const conversations = useMemo(
    () =>
      all
        .filter((c) => !uid || !c.hiddenBy?.includes(uid))
        .sort((a, b) => activityMillis(b) - activityMillis(a)),
    [all, uid]
  );

  const unreadTotal = useMemo(
    () => conversations.reduce((sum, c) => sum + (uid ? (c.unread?.[uid] ?? 0) : 0), 0),
    [conversations, uid]
  );

  const getConversation = useCallback((id: string) => all.find((c) => c.id === id), [all]);

  const setActiveChat = useCallback((id: string | null) => {
    activeChatRef.current = id;
  }, []);

  const getOrCreateConversation = useCallback(
    (
      currentUserId: string,
      otherUserId: string,
      otherUsername: string,
      otherProfileImage?: string,
      currentUsername?: string
    ) =>
      chat.getOrCreateDirectConversation(
        { uid: currentUserId, username: currentUsername || 'Anonymous' },
        { uid: otherUserId, username: otherUsername, profileImageUrl: otherProfileImage }
      ),
    []
  );

  const createGroupConversation = useCallback(
    (
      currentUserId: string,
      selectedUsers: MemberInput[],
      currentUsername: string,
      groupName?: string
    ) =>
      chat.createGroupConversation(
        { uid: currentUserId, username: currentUsername },
        selectedUsers,
        groupName
      ),
    []
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      if (uid) await chat.hideConversation(id, uid);
    },
    [uid]
  );

  const value = useMemo<ConversationsContextType>(
    () => ({
      conversations,
      isLoading,
      unreadTotal,
      getConversation,
      setActiveChat,
      getOrCreateConversation,
      createGroupConversation,
      deleteConversation,
    }),
    [
      conversations,
      isLoading,
      unreadTotal,
      getConversation,
      setActiveChat,
      getOrCreateConversation,
      createGroupConversation,
      deleteConversation,
    ]
  );

  return <ConversationsContext.Provider value={value}>{children}</ConversationsContext.Provider>;
};

/** The argument is accepted for backwards compatibility with older call sites and ignored. */
export const useConversations = (_currentUserId?: string) => {
  const ctx = useContext(ConversationsContext);
  if (!ctx) throw new Error('useConversations must be used within a ConversationsProvider');
  return ctx;
};
