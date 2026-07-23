/**
 * useAuth.ts (FIXED - Username as Login Credential)
 * Authentication state management
 * 
 * KEY: Username is the permanent login credential
 * Changing username updates Firebase auth email
 */

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateEmail
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '../firebaseConfig';
import { UserProfile } from '../types';

export const useAuth = () => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Fetch user profile from Firestore to get latest username
        const userDocSnap = await getDoc(doc(db, 'users', user.uid));
        
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          setCurrentUser({
            uid: user.uid,
            username: userData.username || 'Anonymous',
            displayName: userData.username || 'Anonymous',
            walletBalance: 0,
            createdAt: new Date(),
          });
        } else {
          setCurrentUser({
            uid: user.uid,
            username: user.email?.split('@')[0] || 'Anonymous',
            displayName: user.email?.split('@')[0] || 'Anonymous',
            walletBalance: 0,
            createdAt: new Date(),
          });
        }
        
        setFirebaseUser(user);
      } else {
        setCurrentUser(null);
        setFirebaseUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Register with username as login credential
  const register = async (username: string, password: string) => {
    const fakeEmail = `${username.trim().toLowerCase()}@syph.com`;
    const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password);

    // Create user profile in Firestore
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      uid: userCredential.user.uid,
      username: username.trim(),
      lastUsernameChange: null,
      createdAt: serverTimestamp(),
    });

    return userCredential;
  };

  // Login with username
  const login = async (username: string, password: string) => {
    const fakeEmail = `${username.trim().toLowerCase()}@syph.com`;
    return signInWithEmailAndPassword(auth, fakeEmail, password);
  };

  // Update username AND Firebase auth email
  // This is called from useUserProfile when username changes
  const updateUsernameInAuth = async (newUsername: string) => {
    if (!firebaseUser) {
      return { success: false, error: 'No user logged in' };
    }

    try {
      const newEmail = `${newUsername.trim().toLowerCase()}@syph.com`;
      
      // Update Firebase auth email
      await updateEmail(firebaseUser, newEmail);
      
      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    return signOut(auth);
  };

  return { 
    currentUser, 
    firebaseUser, 
    isLoading, 
    register, 
    login, 
    logout,
    updateUsernameInAuth // ← Export this for use in useUserProfile
  };
};