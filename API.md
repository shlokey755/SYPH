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
- The rules were written and re-reviewed by hand but **have not been executed against the emulator** (the emulator download was blocked in the build environment). Run the rules tests once; if a case fails, tell me which one.

### 1.2 Environment variables (`.env`, see `.env.example`)

| Variable | Where to find it |
|----------|------------------|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Console > Project settings > Your apps > Web app |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | same |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | same |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | same |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | same |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | same |

These ship inside the app bundle, so they are client config, not secrets. Access control is the rules files.

### 1.3 Expo Go

The project is on Expo SDK 57, which matches the current Expo Go from the store. After pulling: `npm install` then `npx expo start -c`.

## 2. Data model (Firestore)

| Path | Purpose |
|------|---------|
| `users/{uid}` | Public profile: `username`, `usernameLowercase`, `profileImageUrl`, `status`, `theme` |
| `users/{uid}/private/settings` | Owner-only: `mutedChats[]`, `notificationsEnabled`, `expoPushTokens[]` |
| `conversations/{id}` | `participantIds[]`, `isGroup`, `groupName`, `createdBy`, last-message summary, `hiddenBy[]`, `readState{uid:{deliveredAt,readAt}}`, `unread{uid:n}` |
| `conversations/{id}/messages/{id}` | `type`, `text`, `media`, `senderId`, `replyTo`, `forwarded`, `deletedFor[]`, `deletedForEveryone`, `createdAt` |

1-on-1 chats use the id `<uidA>_<uidB>` (sorted), so two people can never end up with two chats.

## 3. Coming with later features (not needed yet)

Filled in as each feature lands.

| Feature | You will need to provide |
|---------|--------------------------|
| Photos, video, voice notes, documents (FR-05) | Firebase Storage enabled for the project (it may require the pay-as-you-go plan - check Console > Storage), plus `storage.rules` which I will add |
| GIFs (FR-05) | A Giphy API key as `EXPO_PUBLIC_GIPHY_API_KEY` |
| Push notifications (FR-10) | A development build (remote push does not work in Expo Go on Android), FCM credentials via EAS, and a small Node server with a Firebase service-account key |
| Audio / video calls (FR-06) | A development build (WebRTC is not in Expo Go) and a TURN server for calls across networks |
| Google / phone sign-in (FR-01) | OAuth client IDs and a development build |
