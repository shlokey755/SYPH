/**
 * useUserProfile.ts
 * The signed-in user's profile, plus username changes (once per day).
 *
 * Username-only accounts sign in as `<username>@syph.com`, so changing the username also changes that Firebase
 * email and the old username stops working. Accounts with a real email sign in with the email, so their
 * username is just a handle and the Firebase email is left alone. Either way the new name is claimed in the
 * username registry first, so it cannot clash with anyone else's.
 */

import { updateEmail } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { auth, db } from '../firebaseConfig';
import {
  RegistryUnavailableError,
  claimUsername,
  isUsernameAvailable,
  releaseUsername,
} from '../services/accountService';
import { UserProfile } from '../types';
import {
  friendlyAuthError,
  isLegacyEmail,
  normalizeUsername,
  usernameOnlyEmail,
  validateUsername,
} from '../utils/auth';
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

  /** Merges fields that were just saved elsewhere, so the screen shows them without another read. */
  const patchProfile = useCallback((fields: Partial<UserProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...fields } : prev));
  }, []);

  const updateUsername = async (newUsername: string) => {
    if (!uid || !canChangeUsername) {
      return { success: false, error: 'Cannot change username now' };
    }

    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'No user logged in' };
    }

    const problem = validateUsername(newUsername);
    if (problem) return { success: false, error: problem };

    const trimmed = newUsername.trim();
    const lower = normalizeUsername(trimmed);
    const oldLower = profile?.usernameLowercase || normalizeUsername(profile?.username ?? '');
    const sameName = lower === oldLower; // only the capitalisation changes
    const legacy = isLegacyEmail(user.email);

    const oldEmail = user.email;
    let claimed = false;
    let emailMoved = false;
    try {
      if (!sameName) {
        if (!(await isUsernameAvailable(lower, uid)) || !(await claimUsername(uid, lower))) {
          return { success: false, error: 'That username is taken.' };
        }
        claimed = true;

        // Username-only accounts sign in with the username, so the Firebase email has to follow it.
        if (legacy) {
          await updateEmail(user, usernameOnlyEmail(lower));
          emailMoved = true;
        }
      }

      await updateDoc(doc(db, 'users', uid), {
        username: trimmed,
        usernameLowercase: lower, // user search and uniqueness checks read this field
        lastUsernameChange: serverTimestamp(),
      });

      if (!sameName) await releaseUsername(uid, oldLower);

      setProfile((prev) => (prev ? { ...prev, username: trimmed, usernameLowercase: lower } : null));
      setCanChangeUsername(false);
      setTimeUntilCanChange('24h 0m');
      return { success: true, error: null };
    } catch (error: any) {
      if (emailMoved && oldEmail) await updateEmail(user, oldEmail).catch(() => {}); // keep sign-in and profile in step
      if (claimed) await releaseUsername(uid, lower);
      if (error instanceof RegistryUnavailableError) return { success: false, error: error.message };
      if (legacy && error?.code === 'auth/operation-not-allowed') {
        return {
          success: false,
          error: 'Firebase does not allow this change on a username-only account. Add an email under Account email first.',
        };
      }
      return { success: false, error: friendlyAuthError(error?.code, 'email') ?? error?.message ?? 'Could not change username' };
    }
  };

  return {
    profile,
    isLoading,
    canChangeUsername,
    timeUntilCanChange,
    updateUsername,
    patchProfile,
  };
};