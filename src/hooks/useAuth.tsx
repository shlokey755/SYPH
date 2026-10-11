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

  const loadProfile = useCallback(async (user: User) => {
    const userDocSnap = await getDoc(doc(db, 'users', user.uid));

    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      setCurrentUser({
        uid: user.uid,
        username: userData.username || 'Anonymous',
        usernameLowercase: userData.usernameLowercase || (userData.username ? userData.username.toLowerCase() : 'anonymous'),
        displayName: userData.displayName || userData.username || 'Anonymous',
        profileImageUrl: userData.profileImageUrl,
        status: userData.status,
        theme: userData.theme,
        createdAt: new Date(),
      });
    } else {
      const fallbackUsername = user.email?.split('@')[0] || 'Anonymous';
      setCurrentUser({
        uid: user.uid,
        username: fallbackUsername,
        usernameLowercase: fallbackUsername.toLowerCase(),
        displayName: fallbackUsername,
        createdAt: new Date(),
      });
    }
    setFirebaseUser(user);
  }, []);

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
          await loadProfile(user);
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
    if (uid) await unregisterPush(uid);
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