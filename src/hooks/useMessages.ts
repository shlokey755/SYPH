/**
 * useMessages.ts
 * Live message list for one conversation, newest first (use with an inverted FlatList).
 * Loads the latest PAGE_SIZE messages and grows the window as the user scrolls back.
 */

import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../firebaseConfig';
import { Message } from '../types';

const PAGE_SIZE = 40;

function toMessage(docSnap: QueryDocumentSnapshot): Message {
  const data = docSnap.data({ serverTimestamps: 'estimate' });
  return {
    id: docSnap.id,
    type: data.type ?? 'text',
    text: data.text ?? '',
    media: data.media,
    senderId: data.senderId ?? '',
    senderUsername: data.senderUsername ?? 'Anonymous',
    replyTo: data.replyTo,
    forwarded: data.forwarded === true,
    deletedFor: data.deletedFor ?? [],
    deletedForEveryone: data.deletedForEveryone === true,
    createdAt: data.createdAt ?? null,
    pending: docSnap.metadata.hasPendingWrites,
  };
}

export const useMessages = (conversationId: string | undefined, myUid: string | undefined) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [windowSize, setWindowSize] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    setMessages([]);
    setIsLoading(true);
    setWindowSize(PAGE_SIZE);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      setIsLoading(false);
      return;
    }

    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(windowSize)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        setMessages(
          snapshot.docs.map(toMessage).filter((m) => !myUid || !m.deletedFor.includes(myUid))
        );
        setHasMore(snapshot.size >= windowSize);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching messages:', error);
        setIsLoading(false);
      }
    );
  }, [conversationId, windowSize, myUid]);

  const loadMore = useCallback(() => {
    if (hasMore) setWindowSize((size) => size + PAGE_SIZE);
  }, [hasMore]);

  return { messages, isLoading, hasMore, loadMore };
};
