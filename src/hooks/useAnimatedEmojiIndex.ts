/**
 * useAnimatedEmojiIndex.ts
 * The list of emoji that have an animation (services/animatedEmojiList.ts) as React state: null while unknown, then the
 * index. Mounting it starts loading the list when needed.
 */

import { useEffect, useSyncExternalStore } from 'react';
import {
  getAnimatedEmojiIndex,
  loadAnimatedEmojiList,
  subscribeAnimatedEmojiList,
} from '../services/animatedEmojiList';

export function useAnimatedEmojiIndex(): Map<string, string> | null {
  useEffect(() => {
    loadAnimatedEmojiList();
  }, []);
  return useSyncExternalStore(subscribeAnimatedEmojiList, getAnimatedEmojiIndex, getAnimatedEmojiIndex);
}
