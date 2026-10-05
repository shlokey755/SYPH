// src/hooks/useAuth.ts
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateEmail,
  User
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebaseConfig';
import { UserProfile } from '../types';

interface AuthContextType {
  currentUser: UserProfile | null;
  firebaseUser: User | null;
  isLoading: boolean;
  register: (username: string, password: string) => Promise<any>;
  login: (username: string, password: string) => Promise<any>;
  logout: () => Promise<void>;
  updateUsernameInAuth: (newUsername: string) => Promise<{ success: boolean; error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Safety fallback: force loading to false after 3 seconds if Firebase hangs
    const safetyTimer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      clearTimeout(safetyTimer);
      
      try {
        if (user) {
          const userDocSnap = await getDoc(doc(db, 'users', user.uid));
          
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            setCurrentUser({
              uid: user.uid,
              username: userData.username || 'Anonymous',
              usernameLowercase: userData.usernameLowercase || (userData.username ? userData.username.toLowerCase() : 'anonymous'),
              displayName: userData.username || 'Anonymous',
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
  }, []);

  const register = async (username: string, password: string) => {
    const trimmedUsername = username.trim();
    const fakeEmail = `${trimmedUsername.toLowerCase()}@syph.com`;
    const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password);

    await setDoc(doc(db, 'users', userCredential.user.uid), {
      uid: userCredential.user.uid,
      username: trimmedUsername,
      usernameLowercase: trimmedUsername.toLowerCase(),
      lastUsernameChange: null,
      createdAt: serverTimestamp(),
    });

    return userCredential;
  };

  const login = async (username: string, password: string) => {
    const cleanUsername = username.trim().toLowerCase();
    const fakeEmail = `${cleanUsername}@syph.com`;
    return signInWithEmailAndPassword(auth, fakeEmail, password);
  };

  const updateUsernameInAuth = async (newUsername: string) => {
    if (!firebaseUser) {
      return { success: false, error: 'No user logged in' };
    }

    try {
      const newEmail = `${newUsername.trim().toLowerCase()}@syph.com`;
      await updateEmail(firebaseUser, newEmail);
      return { success: true, error: null };
    } catch (error: any) {
      if (error.code === 'auth/requires-recent-login') {
        return { 
          success: false, 
          error: 'Recent authentication required. Please log out and log back in to change your username.' 
        };
      }
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
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
        logout,
        updateUsernameInAuth,
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