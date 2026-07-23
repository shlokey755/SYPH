/**
 * useUserSearch.ts
 * Search for users by username
 */

import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { useState } from 'react';
import { db } from '../firebaseConfig';

export interface SearchResult {
  uid: string;
  username: string;
  profileImageUrl?: string;
}

export const useUserSearch = () => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchUsers = async (searchTerm: string, currentUserId: string) => {
    if (!searchTerm.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      // Search for users whose username starts with search term
      const q = query(
        collection(db, 'users'),
        where('username', '>=', searchTerm.toLowerCase()),
        where('username', '<=', searchTerm.toLowerCase() + '\uf8ff'),
        limit(10)
      );

      const snapshot = await getDocs(q);
      const searchResults: SearchResult[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        // Exclude current user from results
        if (data.uid !== currentUserId) {
          searchResults.push({
            uid: data.uid,
            username: data.username,
            profileImageUrl: data.profileImageUrl,
          });
        }
      });

      setResults(searchResults);
    } catch (err: any) {
      setError(err.message);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setResults([]);
    setError(null);
  };

  return { results, isSearching, error, searchUsers, clearSearch };
};