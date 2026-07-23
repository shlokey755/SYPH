import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// 1. Import everything as an object from firebase/auth
import * as firebaseAuth from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCCvScn0DwsFVPxuyQJuDMIbp5Tx22MuUs",
  authDomain: "syph-3c8be.firebaseapp.com",
  projectId: "syph-3c8be",
  storageBucket: "syph-3c8be.firebasestorage.app",
  messagingSenderId: "1075274178952",
  appId: "1:1075274178952:web:86ea7c40a52101d5b1da3d"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let auth: any;

try {
  // 2. Extract the functions dynamically to trick TypeScript's linter
  const { initializeAuth, getReactNativePersistence } = firebaseAuth as any;
  
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (error) {
  auth = firebaseAuth.getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };




