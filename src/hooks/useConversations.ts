import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../firebaseConfig';
import { Conversation, ConversationParticipant, Message } from '../types';

export const useConversations = (
  currentUserId: string | undefined,
  onNewMessage?: (senderUsername: string, messageText: string, conversationId: string) => void
) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // FIXED: Ref preserves active message listeners across renders without triggering duplicate subscriptions
  const messageListenersRef = useRef<Record<string, () => void>>({});

  // Listen to new messages in a conversation
  const setupMessageListener = useCallback(
    (conversationId: string, userId: string, callback?: (sender: string, message: string, convId: string) => void) => {
      if (messageListenersRef.current[conversationId]) {
        return; // Already listening
      }

      const messagesRef = collection(db, `conversations/${conversationId}/messages`);
      const q = query(messagesRef);

      const unsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const messageData = change.doc.data();

            // Only notify if message is from someone else
            if (messageData.senderId !== userId && callback) {
              callback(
                messageData.senderUsername,
                messageData.text,
                conversationId
              );
            }
          }
        });
      });

      messageListenersRef.current[conversationId] = unsubscribe;
    },
    []
  );

  useEffect(() => {
    if (!currentUserId) {
      setIsLoading(false);
      return;
    }

    const q = query(collection(db, 'conversations'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const convs: Conversation[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Conversation;

          let isParticipant = false;

          if (data.isGroup && data.participants) {
            isParticipant = data.participants.some((p) => p.uid === currentUserId);
          } else {
            isParticipant =
              data.participant1?.uid === currentUserId ||
              data.participant2?.uid === currentUserId;
          }

          if (!data.isDeleted && isParticipant) {
            convs.push({ ...data, id: docSnap.id });

            // Set up message listener safely
            setupMessageListener(docSnap.id, currentUserId, onNewMessage);
          }
        });
        setConversations(convs);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error listening to conversations:', error);
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribe();
      // Clean up all message listeners when component unmounts
      Object.values(messageListenersRef.current).forEach((unsub) => unsub());
      messageListenersRef.current = {};
    };
  }, [currentUserId, onNewMessage, setupMessageListener]);

  // Get or create 1-on-1 conversation
  const getOrCreateConversation = async (
    currentUserId: string,
    otherUserId: string,
    otherUsername: string,
    otherProfileImage?: string,
    currentUsername?: string
  ) => {
    try {
      const conversationId = [currentUserId, otherUserId].sort().join('_');

      const q = query(
        collection(db, 'conversations'),
        where('id', '==', conversationId)
      );
      const existing = await getDocs(q);

      if (!existing.empty) {
        const existingDoc = existing.docs[0];
        const existingData = existingDoc.data() as Conversation;

        if (existingData.isDeleted) {
          await updateDoc(doc(db, 'conversations', existingDoc.id), {
            isDeleted: false,
            deletedAt: null,
          });
        }

        return existingDoc.id;
      }

      const convRef = await addDoc(collection(db, 'conversations'), {
        id: conversationId,
        isGroup: false,
        participant1: {
          uid: currentUserId,
          username: currentUsername || 'Anonymous',
          profileImageUrl: '',
        },
        participant2: {
          uid: otherUserId,
          username: otherUsername,
          profileImageUrl: otherProfileImage || '',
        },
        lastMessage: '',
        lastMessageTime: null,
        lastMessageSenderId: null,
        isDeleted: false,
        deletedAt: null,
        createdAt: serverTimestamp(),
      });

      return convRef.id;
    } catch (error) {
      console.error('Error in getOrCreateConversation:', error);
      throw error;
    }
  };

  // Create group conversation
  const createGroupConversation = async (
    currentUserId: string,
    selectedUsers: Array<{ uid: string; username: string; profileImageUrl?: string }>,
    currentUsername: string,
    groupName?: string
  ) => {
    try {
      const participants: ConversationParticipant[] = [
        {
          uid: currentUserId,
          username: currentUsername,
          profileImageUrl: '',
        },
        ...selectedUsers,
      ];

      const sortedUIDs = participants
        .map((p) => p.uid)
        .sort()
        .join('_');
      const groupConversationId = `group_${sortedUIDs}`;

      const q = query(
        collection(db, 'conversations'),
        where('id', '==', groupConversationId)
      );
      const existing = await getDocs(q);

      if (!existing.empty) {
        const existingDoc = existing.docs[0];
        const existingData = existingDoc.data() as Conversation;

        if (existingData.isDeleted) {
          await updateDoc(doc(db, 'conversations', existingDoc.id), {
            isDeleted: false,
            deletedAt: null,
          });
        }

        return existingDoc.id;
      }

      const convRef = await addDoc(collection(db, 'conversations'), {
        id: groupConversationId,
        isGroup: true,
        groupName: groupName || `Group (${participants.length})`,
        participants: participants,
        lastMessage: '',
        lastMessageTime: null,
        lastMessageSenderId: null,
        isDeleted: false,
        deletedAt: null,
        createdAt: serverTimestamp(),
      });

      return convRef.id;
    } catch (error) {
      console.error('Error creating group conversation:', error);
      throw error;
    }
  };

  // Send message
  const sendMessage = async (
    conversationId: string,
    text: string,
    senderId: string,
    senderUsername: string,
    receiverId?: string
  ) => {
    if (!text.trim()) return;

    try {
      await addDoc(collection(db, `conversations/${conversationId}/messages`), {
        text: text.trim(),
        senderId,
        senderUsername,
        receiverId: receiverId || null,
        status: 'sent',
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'conversations', conversationId), {
        lastMessage: text.trim().substring(0, 50),
        lastMessageTime: serverTimestamp(),
        lastMessageSenderId: senderId,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  };

  // Get messages for a conversation
  const getConversationMessages = (conversationId: string) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [messagesLoading, setMessagesLoading] = useState(true);

    useEffect(() => {
      if (!conversationId) {
        setMessagesLoading(false);
        return;
      }

      try {
        // OPTIMIZED: Query directly orders messages on Firestore side
        const messagesRef = collection(db, `conversations/${conversationId}/messages`);
        const q = query(messagesRef, orderBy('createdAt', 'asc'));

        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const msgs: Message[] = [];
            snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              msgs.push({
                id: docSnap.id,
                text: data.text || '',
                senderId: data.senderId || '',
                senderUsername: data.senderUsername || 'Anonymous',
                receiverId: data.receiverId,
                status: data.status || 'sent',
                createdAt: data.createdAt,
              });
            });

            setMessages(msgs);
            setMessagesLoading(false);
          },
          (error) => {
            console.error('Error fetching messages:', error);
            setMessagesLoading(false);
          }
        );

        return () => unsubscribe();
      } catch (error) {
        console.error('Error setting up messages listener:', error);
        setMessagesLoading(false);
      }
    }, [conversationId]);

    return { messages, messagesLoading };
  };

  const deleteConversation = async (conversationId: string) => {
    try {
      await updateDoc(doc(db, 'conversations', conversationId), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      throw error;
    }
  };

  const restoreConversation = async (conversationId: string) => {
    try {
      await updateDoc(doc(db, 'conversations', conversationId), {
        isDeleted: false,
        deletedAt: null,
      });
    } catch (error) {
      console.error('Error restoring conversation:', error);
      throw error;
    }
  };

  return {
    conversations,
    isLoading,
    getOrCreateConversation,
    createGroupConversation,
    sendMessage,
    getConversationMessages,
    deleteConversation,
    restoreConversation,
  };
};