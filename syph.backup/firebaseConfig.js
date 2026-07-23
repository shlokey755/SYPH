import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
// FIX: Import both auth functions from 'firebase/auth'
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
// FIX: Only import getFirestore from 'firebase/firestore'
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCCvScn0DwsFVPxuyQJuDMIbp5Tx22MuUs",
  authDomain: "syph-3c8be.firebaseapp.com",
  projectId: "syph-3c8be",
  storageBucket: "syph-3c8be.firebasestorage.app",
  messagingSenderId: "1075274178952",
  appId: "1:1075274178952:web:86ea7c40a52101d5b1da3d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services and Export
export const db = getFirestore(app);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});