/**
 * useUserProfile.ts (FIXED - Updates Auth Email on Username Change)
 * Manage user profile updates with username change limit
 * 
 * KEY: When username changes, Firebase auth email is updated
 * Old username can no longer login
 */

import { updateEmail } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '../firebaseConfig';
import { UserProfile } from '../types';
import { toMillis } from '../utils/conversation';

export const useUserProfile = (uid: string | undefined) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [canChangeUsername, setCanChangeUsername] = useState(false);
  const [timeUntilCanChange, setTimeUntilCanChange] = useState<string>('');

  useEffect(() => {
    if (!uid) return;

    const fetchProfile = async () => {
      const docSnap = await getDoc(doc(db, 'users', uid));
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setProfile(data);

        // Check if user can change username
        if (!data.lastUsernameChange) {
          setCanChangeUsername(true);
        } else {
          const nextChange = new Date(toMillis(data.lastUsernameChange) + 24 * 60 * 60 * 1000);
          const now = new Date();

          if (now >= nextChange) {
            setCanChangeUsername(true);
          } else {
            setCanChangeUsername(false);
            // Calculate time remaining
            const diff = nextChange.getTime() - now.getTime();
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            setTimeUntilCanChange(`${hours}h ${minutes}m`);
          }
        }
      }
      setIsLoading(false);
    };

    fetchProfile();
  }, [uid]);

  // Update username (once per day)
  // IMPORTANT: This also updates Firebase auth email
  const updateUsername = async (newUsername: string) => {
    if (!uid || !canChangeUsername) {
      return { success: false, error: 'Cannot change username now' };
    }

    if (!auth.currentUser) {
      return { success: false, error: 'No user logged in' };
    }

    try {
      const newEmail = `${newUsername.trim().toLowerCase()}@syph.com`;

      // Step 1: Update Firebase auth email
      await updateEmail(auth.currentUser, newEmail);

      // Step 2: Update Firestore profile
      await updateDoc(doc(db, 'users', uid), {
        username: newUsername.trim(),
        lastUsernameChange: serverTimestamp(),
      });

      // Step 3: Update local state
      setProfile(prev => prev ? { ...prev, username: newUsername.trim() } : null);
      setCanChangeUsername(false);
      setTimeUntilCanChange('24h 0m');

      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  return {
    profile,
    isLoading,
    canChangeUsername,
    timeUntilCanChange,
    updateUsername,
  };
};