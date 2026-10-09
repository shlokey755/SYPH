# SYPH Development Journey

Newest first. The first section is the feature build (October 6 to 9, 2026); the second is the original debugging post-mortem (October 4, 2026).

---

## Part 2: Building the missing features and tidying the repo (Oct 6-9, 2026)

### What was done, in order

1. **Cleanup.** `node_modules` was tracked in git and is no longer. Dependencies were aligned to Expo SDK 57. `.env.example` added. Firestore rules rewritten from "any signed-in user can read everything" to membership-based rules (chats now carry `participantIds`).
2. **Chat core, read receipts, reply / forward / delete / copy, themes, search and mute, media.** They landed as separate commits (see `git log`), with rules changes and tests alongside where they apply.
3. **Push notifications.** App side: permission, token registration, Android channel, tap-to-open, badge. Server side: `server/`, a small Node relay using the Admin SDK that only sends to tokens the `pushTokens` registry ties to the recipient.
4. **Offline indicator and onboarding screen.**
5. **Calls.** WebRTC with Firestore signalling, an incoming-call overlay, a call screen, call pushes from the relay.
6. **Generated native folders.** `android/` was tracked even though config plugins only run at prebuild, so edits in `app.json` would not have reached builds. It is now git-ignored and regenerated (`npx expo prebuild`).

### Problems met and how they were settled

| Problem | Resolution |
|---------|------------|
| `npm install` dropped connections on large packages | Retry flags: `--maxsockets=4 --fetch-retries=6 --fetch-retry-mintimeout=3000` |
| `expo install --fix` blocked by the proxy | Took versions from `node_modules/expo/bundledNativeModules.json` |
| TypeScript: `toDate` missing on `Timestamp \| Date` | Small `toMillis()` helper instead of casting |
| Firestore emulator could not be downloaded (policy 403) | Not bypassed. Rules tests are written but unexecuted, and every doc says so |
| Incoming-call query would be rejected by a `participantIds` rule | List rule for `calls` is written in terms of `calleeId` / `callerId`, the fields the query filters on |
| `react-native-webrtc` typings import a module that is not shipped, so `addEventListener` had no type | Typed the few events we use in `services/webrtc.ts` (`PeerEvents`) rather than loosening types everywhere |
| Web export fails | Not caused by this work: the project has no `react-native-web` dependency, so web is out of scope |

### Things worth knowing

- Commit `b9b1a543` is titled as if it contained the push and offline work; it only reorders `API.md`. The real work is in the commit before it (`3186ff3c`). It was left alone because it was already pushed.
- Design choices that were deliberate: calls ignore per-chat mute but obey the global notification switch; a ringing call older than 75 s is never shown; the relay watches `calls` with a single-field range query to avoid needing a composite index.
- Still open: Google / phone sign-in (needs OAuth client IDs and a dev build), full-history search (needs an external search service), a real two-phone call test, and running the rules tests once.

---

## Part 1: First debugging session, post-mortem (Oct 4, 2026)



---

## Critical Issues Encountered (Detailed Breakdown)

### 1. Missing .env File
**Problem:** Firebase config was reading from environment variables that didn't exist.
- **Impact:** ALL Firebase initialization failed → Complete app crash
- **Root Cause:** .env file was never committed/provided in original project
- **Symptoms:** App buffered forever, Firebase returned undefined values
- **Fix Applied:** Created .env with hardcoded Firebase credentials
- **Lesson:** Environment files are critical; always include them in development setup

---

### 2. Firestore Security Rules Mismatch
**Problem:** Firestore rules used collection `/chats` but app code read from `/conversations`
- **Impact:** All database operations denied by Firestore
- **Root Cause:** Rules were outdated/didn't match codebase
- **Symptoms:** App hung on login, no data loaded
- **Fix Applied:** Updated rules to match actual collection names
- **Lesson:** Always verify rule collection names match code

---

### 3. Layout Routing Error
**Problem:** Routes configured incorrectly in Expo Router
- **Impact:** App crashed when navigating between screens
- **Root Cause:** Auth redirect logic broken, conflicting route definitions
- **Symptoms:** Red error screen, "runtime not ready" errors
- **Fix Applied:** Simplified routing, fixed auth redirect logic
- **Lesson:** Test auth flow immediately after setup

---

### 4. Authentication Completely Broken
**Problem:** User could not login/register
- **Impact:** App unusable - no access to main features
- **Root Causes (Multiple):**
  - Missing .env (see #1)
  - Firestore rules denied writes (see #2)
  - No proper error handling/logging
- **Symptoms:** Login button did nothing, no error messages
- **Lesson:** Add console logging immediately when auth fails

---

### 5. expo-dev-client Dependency Conflict
**Problem:** Package.json still had `expo-dev-client` package
- **Impact:** Conflicted with Expo Go, caused installation issues
- **Root Cause:** Old package not removed when switching to Expo Go
- **Fix Applied:** Removed from dependencies
- **Lesson:** Clean up dev dependencies for dev environment

---

### 6. React/React Native Version Mismatches
**Multiple Issues:**

#### 6a. React 19 with React Native 0.76
- **Problem:** React 19.1.0 incompatible with RN 0.76.0
- **Impact:** npm install failed with peer dependency errors
- **Fix Applied:** Downgraded React to 18.3.1
- **Lesson:** Always match React/RN versions correctly

#### 6b. @types/react Version Conflict
- **Problem:** Had `@types/react@19.1.10` with RN 0.76 (expects @18)
- **Impact:** npm error: "Could not resolve dependency"
- **Fix Applied:** Updated @types/react to match RN version
- **Lesson:** Type definitions must match runtime versions

#### 6c. Expo SDK 54 vs SDK 57 Mismatch
- **Problem:** Project was configured for Expo 54, but device had Expo Go SDK 57
- **Impact:** Fatal incompatibility - app would not run
- **Symptoms:** "Project is incompatible with this version of Expo Go"
- **Fix Applied:** Upgraded entire project to Expo 57 + compatible React/RN
- **Lesson:** ALWAYS check Expo Go version on device first

---

### 7. PlatformConstants Module Not Found (CRITICAL)
**Problem:** `TurboModuleRegistry.getEnforcing(...): 'PlatformConstants' could not be found`
- **Impact:** App crashed immediately on load, every time
- **Root Cause:** `getReactNativePersistence()` tries to load native modules that don't exist in Expo Go
- **Why It Happened:** Attempted to use AsyncStorage persistence in development
- **Symptoms:** Red error screen, infinite loop of crashes
- **Fix Applied:** Removed AsyncStorage persistence code, used simple `getAuth()` for dev
- **Lesson:** Expo Go has no native module support - can't use persistence in dev

---

### 8. Metro Bundler Cache Corruption
**Problem:** Metro bundler cached old/broken code
- **Impact:** Errors persisted even after fixes
- **Symptoms:** Same errors even after clearing node_modules
- **Fix Applied:** Used `expo start -c` to clear Metro cache
- **Lesson:** Cache clearing is essential after major changes

---

## Summary of Root Causes

| Category | Issue | Why It Happened |
|----------|-------|-----------------|
| **Configuration** | Missing .env | Project extracted without env file |
| **Rules** | Firestore collection mismatch | Rules never synced with code |
| **Dependencies** | Version conflicts (React, RN, Expo) | No version alignment check at start |
| **Environment** | Expo Go SDK 57 vs Project SDK 54 | No device/project sync verification |
| **Native Code** | AsyncStorage in Expo Go | Misunderstood Expo Go limitations |
| **Caching** | Metro bundler corruption | Not clearing cache between major changes |

---

## What Actually Worked

✅ Firebase config (once .env was added)  
✅ Firestore rules (once updated)  
✅ Authentication flow (once everything else was fixed)  
✅ Routing structure (once simplified)  
✅ UI components and screens  
✅ Real-time messaging setup  

---

## Lessons for Next Attempt

### Pre-Build Checklist
- [ ] Verify Expo Go version on device
- [ ] Ensure project Expo version matches device
- [ ] Create/add .env file with all credentials
- [ ] Verify Firestore collection names in rules match code
- [ ] Check all version constraints (React, RN, Expo)
- [ ] Remove dev-only packages for Expo Go testing

### During Build
- [ ] Test login immediately after Firebase setup
- [ ] Don't use AsyncStorage persistence in Expo Go
- [ ] Use `expo start -c` when making major changes
- [ ] Add console.log() at every critical point
- [ ] Test auth flow FIRST, UI later

### Error Response
- [ ] PlatformConstants error? → Remove native module dependencies from dev
- [ ] Version conflict? → Run `npm install --legacy-peer-deps` if needed
- [ ] "Invariant Violation"? → Clear cache with `-c` flag
- [ ] Auth failing silently? → Check .env first, then Firestore rules

---

## Files That Need Fixing

- `.env` - Add to repo (or .env.example)
- `src/firebaseConfig.ts` - AsyncStorage persistence breaks Expo Go
- `package.json` - Version management critical
- `firestore.rules` - Keep synced with code collection names
- `app.json` - Expo version must match device

---

## What Would Have Prevented This

1. **Project Setup Documentation** - A clear setup guide listing all requirements
2. **Version Lock File** - A .lock file ensuring exact version matching
3. **Pre-flight Checks** - A script to validate environment before running
4. **Better Error Messages** - App should log what Firebase is initializing
5. **Env Example File** - `.env.example` showing required keys
6. **CI/CD Pipeline** - Would catch version conflicts before development

---

## Conclusion

**Main Takeaway:** This wasn't a code problem; it was an **environment and configuration problem**. The app itself is well-designed, but without proper setup (correct versions, .env file, Firestore rules, Expo matching), it was impossible to run.

**Next Time:** Start with environment validation, not feature building.

---

**Session End:** October 4, 2026 12:55 IST  
**Status:** Hibernating - Ready for next attempt  
**Code Quality:** Good ✅  
**Setup Quality:** Critical Issues ❌  
