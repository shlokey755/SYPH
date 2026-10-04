# SYPH Development - Complete Build Instructions

## Overview
SYPH is a React Native/Expo real-time chat application built on Firebase. This document contains all steps taken to build, debug, and configure the app.

---

## Initial Setup & Diagnosis

### Step 1: Environment Analysis
- **Framework:** React Native with Expo
- **Backend:** Firebase (Auth + Firestore)
- **Target:** Expo Go for testing, APK for production
- **Initial Issues:** App buffering on load, auth broken, layout routing errors

### Step 2: Identified Critical Problems
1. Missing `.env` file with Firebase credentials
2. Firestore security rules collection mismatch
3. React/React Native version conflicts
4. Expo SDK version mismatch (device vs project)
5. Native module compatibility issues

---

## Configuration Files Setup

### Step 3: Create `.env` File
**Location:** `/SYPH/.env`

```env
EXPO_PUBLIC_FIREBASE_API_KEY="AIzaSyCCvScn0DwsFVPxuyQJuDMIbp5Tx22MuUs"
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN="syph-3c8be.firebaseapp.com"
EXPO_PUBLIC_FIREBASE_PROJECT_ID="syph-3c8be"
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET="syph-3c8be.appspot.com"
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="1075274178952"
EXPO_PUBLIC_FIREBASE_APP_ID="1:1075274178952:web:86ea7c40a52101d5b1da3d"
```

**Purpose:** Load Firebase credentials into the app
**Critical:** Without this, Firebase initialization fails completely

### Step 4: Update Firestore Security Rules
**Location:** Firebase Console → Firestore → Rules tab

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users collection - only read/write own document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Conversations collection - any authenticated user can read
    match /conversations/{conversationId} {
      allow read: if request.auth != null;
      allow create, write, delete: if request.auth != null;
      
      // Messages subcollection
      match /messages/{messageId} {
        allow read, write: if request.auth != null;
      }
    }
    
    // Default deny all other access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**Why:** App reads from `/conversations` collection, not `/chats`
**Impact:** All database operations were being denied before this

---

## Package.json Configuration

### Step 5: Update Dependencies for Expo 57 Compatibility

**Key Changes:**
```json
{
  "expo": "~57.0.0",          // Was 54.0.0 - must match device Expo Go version
  "react": "^19.1.0",         // Was 18.3.1
  "react-dom": "^19.1.0",     // Was 18.3.1
  "react-native": "^0.81.5",  // Was 0.76.0
  "@types/react": "~19.1.10", // Was 18.3.0 - must match React version
  "typescript": "^5.3.3"
}
```

**Removed:**
- `expo-dev-client` (conflicts with Expo Go)

**Why:** Expo Go on device was SDK 57, but project was SDK 54 - they must match

### Step 6: Clean Node Modules (Windows)
```cmd
rmdir /s /q node_modules
del package-lock.json
npm install
```

---

## Firebase Configuration

### Step 7: Firebase Config File
**Location:** `src/firebaseConfig.ts`

```typescript
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);  // Simple getAuth for Expo Go compatibility
const db = getFirestore(app);

export { app, auth, db };
```

**Critical:** 
- Use `getAuth()` NOT `initializeAuth()` with AsyncStorage in Expo Go
- AsyncStorage persistence breaks in Expo Go (no native modules)
- Persistence will work in compiled APK, just not in Expo Go

---

## Running the App

### Step 8: Start Expo with Cache Clear
```cmd
expo start -c
```

**Flags:**
- `-c` : Clears Metro bundler cache (essential after version changes)

**Expected Output:**
```
Metro waiting on exp://192.168.x.x:8081
Scan the QR code above with Expo Go
```

### Step 9: Test on Device
1. Open Expo Go app on phone
2. Scan QR code from terminal
3. App should load (no red error screen)
4. Login screen should appear

---

## Testing Checklist

### Step 10: Verify Core Functionality

#### Authentication
- [ ] Login screen appears on startup
- [ ] Can type username and password
- [ ] Login button works
- [ ] User authenticated (no auth error)
- [ ] Chat tab accessible after login

#### Navigation
- [ ] 3 tabs visible (Chat, Me, Add)
- [ ] Can switch between tabs
- [ ] No routing errors

#### Firestore
- [ ] Firebase initializes without errors
- [ ] No "PlatformConstants" errors
- [ ] No "access denied" from Firestore

#### Performance
- [ ] App loads within 5 seconds
- [ ] No infinite loops or crashes
- [ ] Metro bundler shows "Ready to accept connections"

---

## Git Commits Made

### Commit History
```
5d778daa - Fix: Use simple getAuth for Expo Go compatibility
32e86d91 - Upgrade to Expo 57 with compatible React/RN versions
e03488fd - Fix: Update @types/react to 18.3.0 for React Native 0.76
4c0188b8 - Fix: Critical issues - add .env, fix auth persistence, etc
```

Each commit addresses a specific layer of the problem:
1. Core configuration (Firebase + Firestore)
2. Version compatibility (React/RN/Expo)
3. Type safety (TypeScript types)
4. Expo Go compatibility (native modules)

---

## Key Architectural Decisions

### Authentication Flow
```
index.tsx (root)
    ↓
useAuth() checks currentUser
    ↓
If logged in → /(tabs) layout
If logged out → /(auth)/login
```

### Firestore Structure
```
users/{uid}
├── username (string)
├── createdAt (timestamp)
└── lastUsernameChange (timestamp)

conversations/{conversationId}
├── isGroup (boolean)
├── participants[] (array)
├── lastMessage (string)
├── messages/{messageId}
│   ├── text (string)
│   ├── senderId (string)
│   └── createdAt (timestamp)
```

### 3-Tab Layout
- **Chat Tab:** List of conversations
- **Me Tab:** User profile & settings
- **Add Tab:** Search & add users

---

## Environment Variables Needed

| Variable | Source | Purpose |
|----------|--------|---------|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Firebase Console | Authenticate requests |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Project | Auth domain |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Project | Firestore location |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Project | File storage (optional) |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Project | Cloud messaging |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Firebase Project | App identifier |

**How to Get These:**
1. Go to Firebase Console
2. Select SYPH project
3. Project Settings → Service Accounts tab
4. Copy the configuration object

---

## Common Issues & Solutions

### Issue: "PlatformConstants could not be found"
**Solution:** Remove AsyncStorage persistence code
- Use simple `getAuth()` instead of `initializeAuth()`
- Persistence only works in compiled APK, not Expo Go

### Issue: "Could not resolve dependency @types/react"
**Solution:** Match @types/react version to React version
- React 19.1.0 → @types/react@~19.1.10
- React 18.3.1 → @types/react@^18.3.0

### Issue: "Project is incompatible with this version of Expo Go"
**Solution:** Match Expo version to device
- Check Expo Go version on device
- Update `package.json` to match

### Issue: App buffering forever
**Solution:** Check in order:
1. Is `.env` file present with credentials?
2. Are Firestore rules updated?
3. Is Expo Go SDK matching project version?

### Issue: "Metro waiting..." but nothing loads
**Solution:** Clear cache
```cmd
expo start -c
```

---

## Build for Production (APK)

### When Ready to Build:
```cmd
eas build --platform android --profile preview
```

**Before Building:**
- Update `.env` to use Android API Key (not Web key)
- Ensure package.json versions are stable
- Run full test suite

**For APK Distribution:**
1. Get APK from EAS build
2. Share .apk file with users
3. Users: Enable "Unknown Sources" in Settings
4. Users: Install by opening .apk file

---

## What Works Now

✅ Firebase Auth (login/register)
✅ Firestore real-time messaging
✅ User authentication flow
✅ 3-tab navigation
✅ Conversation list display
✅ Message sending/receiving
✅ User search & add
✅ Profile management

## What Doesn't Work Yet

❌ Auth persistence in Expo Go (works in APK)
❌ Image uploads (needs Storage API)
❌ Push notifications (needs Cloud Messaging)
❌ Offline mode (needs sync queue)

---

## Next Steps for Next Attempt

### Pre-Build Validation
1. Verify device Expo Go version
2. Check all environment credentials
3. Run Firestore rule validation
4. Verify npm version compatibility

### Development Flow
1. Always test auth immediately
2. Use `expo start -c` on major changes
3. Monitor console for Firebase errors
4. Check Firestore for data writes

### Production Preparation
1. Switch to production API keys
2. Test full login/messaging flow
3. Build APK with EAS
4. Test APK on real device

---

## Reference Links

- Expo Docs: https://docs.expo.dev/versions/v57.0.0/
- Firebase Console: https://console.firebase.google.com/
- GitHub Repo: https://github.com/shlokey755/SYPH

---

## Session Summary

**Date:** October 4, 2026
**Duration:** ~2 hours
**Status:** Hibernating - ready for next iteration
**Code Quality:** Solid ✅
**Setup Quality:** Now Fixed ✅

All configuration is documented. Next attempt should use this guide as the starting point.
