// src/hooks/useAuth.ts
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  User
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { auth, db } from '../firebaseConfig';
import { claimUsername, isUsernameAvailable, releaseUsername, requestPasswordReset } from '../services/accountService';
import { clearCachedProfile, readCachedProfile, writeCachedProfile } from '../services/profileCache';
import { setAppBadge, unregisterPush } from '../services/pushService';
import { UserProfile } from '../types';
import {
  friendlyAuthError,
  loginEmailFor,
  normalizeUsername,
  usernameOnlyEmail,
  validateEmail,
  validatePassword,
  validateUsername,
} from '../utils/auth';

interface AuthContextType {
  currentUser: UserProfile | null;
  firebaseUser: User | null;
  isLoading: boolean;
  /** `email` is optional: without it the account is username-only (no password reset by email). */
  register: (username: string, password: string, email?: string) => Promise<any>;
  /** `identifier` is a username or an email address. */
  login: (identifier: string, password: string) => Promise<any>;
  resetPassword: (email: string) => Promise<void>;
  /** Re-reads the profile from the server, e.g. after the username, name or photo changed. */
  refreshCurrentUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // While register() is running the account exists before its profile document does, so the auth listener must not
  // read the profile yet; register() loads it itself when it is done.
  const registering = useRef(false);

  /** Reads the profile from the server, shows it, and keeps a copy on the device for the next launch. */
  const fetchProfile = useCallback(async (user: User) => {
    const userDocSnap = await getDoc(doc(db, 'users', user.uid));

    let profile: UserProfile;
    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      profile = {
        uid: user.uid,
        username: userData.username || 'Anonymous',
        usernameLowercase: userData.usernameLowercase || (userData.username ? userData.username.toLowerCase() : 'anonymous'),
        displayName: userData.displayName || userData.username || 'Anonymous',
        profileImageUrl: userData.profileImageUrl,
        status: userData.status,
        theme: userData.theme,
        createdAt: new Date(),
      };
      void writeCachedProfile(profile);
    } else {
      const fallbackUsername = user.email?.split('@')[0] || 'Anonymous';
      profile = {
        uid: user.uid,
        username: fallbackUsername,
        usernameLowercase: fallbackUsername.toLowerCase(),
        displayName: fallbackUsername,
        createdAt: new Date(),
      };
    }
    // The person may have signed out while the request was in flight.
    if (auth.currentUser?.uid !== user.uid) return;
    setCurrentUser(profile);
    setFirebaseUser(user);
  }, []);

  /**
   * Signs the user in to the app. When a copy of their profile is on the device it is shown immediately and the
   * server copy is fetched in the background; otherwise this waits for the server, as it always did.
   */
  const loadProfile = useCallback(
    async (user: User, { allowCached = false }: { allowCached?: boolean } = {}) => {
      const cached = allowCached ? await readCachedProfile(user.uid) : null;
      if (cached) {
        if (auth.currentUser?.uid !== user.uid) return;
        setCurrentUser({ ...cached, createdAt: new Date() });
        setFirebaseUser(user);
        setIsLoading(false);
        fetchProfile(user).catch((err) => console.warn('Could not refresh profile:', err?.message ?? err));
        return;
      }
      await fetchProfile(user);
    },
    [fetchProfile]
  );

  const refreshCurrentUser = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await fetchProfile(user);
    } catch (err: any) {
      console.warn('Could not refresh profile:', err?.message ?? err);
    }
  }, [fetchProfile]);

  useEffect(() => {
    // Safety fallback: force loading to false after 3 seconds if Firebase hangs
    const safetyTimer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      clearTimeout(safetyTimer);
      if (registering.current) return;

      try {
        if (user) {
          await loadProfile(user, { allowCached: true });
        } else {
          setCurrentUser(null);
          setFirebaseUser(null);
        }
      } catch (err) {
        console.error("Error fetching user session/doc:", err);
        setCurrentUser(null);
        setFirebaseUser(null);
      } finally {
        setIsLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, [loadProfile]);

  const register = async (username: string, password: string, email?: string) => {
    const emailGiven = !!email?.trim();
    const problem =
      validateUsername(username) ?? (emailGiven ? validateEmail(email!) : null) ?? validatePassword(password);
    if (problem) throw new Error(problem);

    const trimmedUsername = username.trim();
    const lower = normalizeUsername(trimmedUsername);
    const authEmail = emailGiven ? email!.trim().toLowerCase() : usernameOnlyEmail(lower);

    registering.current = true;
    try {
      let credential;
      try {
        credential = await createUserWithEmailAndPassword(auth, authEmail, password);
      } catch (error: any) {
        throw new Error(friendlyAuthError(error.code, 'register', emailGiven) ?? error.message, { cause: error });
      }
      const user = credential.user;

      // The account exists now. Claim the username and write the profile; if anything fails, undo the account so
      // nobody is left with a sign-in that has no profile.
      let claimed = false;
      try {
        if (!(await isUsernameAvailable(lower, user.uid)) || !(await claimUsername(user.uid, lower))) {
          throw new Error('That username is taken.');
        }
        claimed = true;

        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          username: trimmedUsername,
          usernameLowercase: lower,
          lastUsernameChange: null,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        if (claimed) await releaseUsername(user.uid, lower);
        await deleteUser(user).catch(() => signOut(auth));
        throw error;
      }

      if (emailGiven) sendEmailVerification(user).catch(() => {}); // best effort; verification is not required to chat

      await loadProfile(user);
      setIsLoading(false);
      return credential;
    } finally {
      registering.current = false;
    }
  };

  const login = async (identifier: string, password: string) => {
    try {
      return await signInWithEmailAndPassword(auth, loginEmailFor(identifier), password);
    } catch (error: any) {
      throw new Error(friendlyAuthError(error.code, 'login') ?? error.message, { cause: error });
    }
  };

  const resetPassword = async (email: string) => {
    const problem = validateEmail(email);
    if (problem) throw new Error(problem);
    try {
      await requestPasswordReset(email);
    } catch (error: any) {
      throw new Error(friendlyAuthError(error.code, 'reset') ?? error.message, { cause: error });
    }
  };

  const logout = async () => {
    // Detach this device first (needs the signed-in session), so a shared phone stops getting this
    // account's notifications. Bounded by a short timeout so logging out never hangs when offline.
    const uid = auth.currentUser?.uid;
    if (uid) {
      await unregisterPush(uid);
      void clearCachedProfile(uid);
    }
    void setAppBadge(0);
    return signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        firebaseUser,
        isLoading,
        register,
        login,
        resetPassword,
        refreshCurrentUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};