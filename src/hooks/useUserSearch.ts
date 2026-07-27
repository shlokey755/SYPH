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
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      // FIXED: Queries against 'usernameLowercase' to guarantee case-insensitive prefix searches
      const q = query(
        collection(db, 'users'),
        where('usernameLowercase', '>=', term),
        where('usernameLowercase', '<=', term + '\uf8ff'),
        limit(10)
      );

      const snapshot = await getDocs(q);
      const searchResults: SearchResult[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.uid !== currentUserId) {
          searchResults.push({
            uid: data.uid,
            username: data.username, // Display intact username
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