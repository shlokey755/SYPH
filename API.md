# API.md - what SYPH needs from you

Everything the app depends on that lives outside the code: console steps, keys, services. Items are added here as each feature is built.

## 1. Required now

### 1.1 Deploy the Firestore rules (do this before running the new build)

`firestore.rules` replaces the old "any signed-in user can read everything" rules.

| Step | How |
|------|-----|
| Publish | Firebase Console > Firestore Database > Rules > paste `firestore.rules` > Publish. Or `firebase deploy --only firestore:rules`. |
| Test (optional) | `cd tests/firestore-rules && npm install && npm test` - starts the local Firestore emulator (needs Java 11+ and network access for the first-run emulator download). |

**Important**
- Chats now use a `participantIds` field. **Conversations created by the old build do not have it and will not appear.** Recreate your test chats from the Add tab.
- The rules were written and re-reviewed by hand but **have not been executed against the emulator** (the emulator download is blocked in the build environment). Run the rules tests once; if a case fails, tell me which one.

### 1.2 Environment variables (`.env`, see `.env.example`)

| Variable | Where to find it |
|----------|------------------|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Console > Project settings > Your apps > Web app |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | same |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | same |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | same |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | same |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | same |
| `EXPO_PUBLIC_GIPHY_API_KEY` (optional) | https://developers.giphy.com/ > Create an app (SDK/API). Without it the GIF picker shows a "not set up" message; everything else works. |

These ship inside the app bundle, so they are client config, not secrets. Access control is the rules files.

### 1.3 Expo Go

The project is on Expo SDK 57, which matches the current Expo Go from the store. After pulling: `npm install` then `npx expo start -c`.

### 1.4 Media (photos, video, voice notes, documents, profile photos)

| Step | How |
|------|-----|
| Enable Storage | Firebase Console > Storage > Get started. New projects may require the pay-as-you-go (Blaze) plan to create a bucket; free-tier quotas still apply. Without Storage, text chat is unaffected and uploads show a clear error toast. |
| Publish `storage.rules` | Console > Storage > Rules > paste `storage.rules` > Publish (or `firebase deploy --only storage`). These rules read the chat's member list from Firestore, so the console may ask you to grant Storage permission to read Firestore - accept. |
| Permissions | Camera, photo library and microphone prompts are configured in `app.json` (expo-image-picker, expo-audio). Config-plugin changes need a new development build; Expo Go already includes these modules. |

Limits: 25 MB per chat file, 5 MB per profile photo (enforced in `storage.rules`).

## 2. Data model (Firestore)

| Path | Purpose |
|------|---------|
| `users/{uid}` | Public profile: `username`, `usernameLowercase`, `profileImageUrl`, `status`, `theme` |
| `users/{uid}/private/settings` | Owner-only: `mutedChats[]`, `notificationsEnabled`, `expoPushTokens[]` |
| `conversations/{id}` | `participantIds[]`, `isGroup`, `groupName`, `createdBy`, last-message summary, `hiddenBy[]`, `readState{uid:{deliveredAt,readAt}}`, `unread{uid:n}` |
| `conversations/{id}/messages/{id}` | `type`, `text`, `media`, `senderId`, `replyTo`, `forwarded`, `deletedFor[]`, `deletedForEveryone`, `createdAt` |

Storage paths: `chats/{conversationId}/{uid}/{file}`, `avatars/{uid}/{file}`.

1-on-1 chats use the id `<uidA>_<uidB>` (sorted), so two people can never end up with two chats.

### 1.5 Push notifications while the app is closed (FR-10)

In-app toasts and unread badges work everywhere, including Expo Go. Alerts while the app is closed need all of the steps below; skip them and nothing else breaks.

| Step | How |
|------|-----|
| Re-publish `firestore.rules` | It now includes the `pushTokens` registry (same as 1.1). |
| Development build | Remote push does not work in Expo Go or on simulators. `eas build --profile development --platform android` (iOS needs an Apple developer account). |
| FCM credentials (Android) | Firebase Console > Project settings > Cloud Messaging, then `eas credentials` > Android > Google Service Account key for FCM V1. Expo guide: https://docs.expo.dev/push-notifications/fcm-credentials/ |
| APNs key (iOS) | Handled by `eas credentials` when you build for iOS. |
| Run the relay | `server/` is a small Node 22.9+ service. Steps, hosting options and the delivery rules are in `server/README.md`. |
| Service account key | Firebase Console > Project settings > Service accounts > Generate new private key. Put it in `server/.env` or the host's secret store. It gives full database access, so never commit it (already git-ignored). |
| Optional | `EXPO_ACCESS_TOKEN` (expo.dev > Account settings > Access tokens) for enhanced push security; `PUSH_HIDE_PREVIEW=1` to hide message text in notifications. |

Run **one** relay instance. It must stay running; messages sent while it is down are not announced later (unread badges still catch the user up).

## 3. Coming with later features (not needed yet)

Filled in as each feature lands.

| Feature | You will need to provide |
|---------|--------------------------|
| Audio / video calls (FR-06) | A development build (WebRTC is not in Expo Go) and a TURN server for calls across networks |
| Google / phone sign-in (FR-01) | OAuth client IDs and a development build |
