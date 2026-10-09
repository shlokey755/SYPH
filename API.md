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

### 1.6 Offline use (NFR-07)

Nothing to set up. Firestore keeps a local cache, so chats you have already opened stay readable offline and messages you send are queued and delivered when the connection returns (they show a clock icon until then). A slim banner appears on the Chat and conversation screens while the device is offline. Media uploads need a connection and show an error toast if it drops.

### 1.7 Audio and video calls (FR-06)

1-to-1 calls only. Media goes phone to phone over WebRTC; Firestore carries the handshake (`calls/{id}`). Everything else in the app works without any of this.

| Step | How |
|------|-----|
| Re-publish `firestore.rules` | It now includes `calls` and `calls/{id}/candidates` (same as 1.1). |
| Development build | WebRTC is a native module, so calls **do not work in Expo Go** (the call buttons explain this in a toast). `npm install`, then `eas build --profile development --platform android` or `npx expo run:android`. The camera/microphone permissions and the WebRTC config plugin are already in `app.json`. |
| Regenerate native folders | `android/` and `ios/` are git-ignored and rebuilt from `app.json` (`npx expo prebuild --clean`). EAS does this for you. |
| TURN server (strongly advised) | STUN alone connects phones on friendly networks only. Mobile data and many Wi-Fi networks need a TURN relay. Options: a hosted service (Twilio Network Traversal, Metered, Cloudflare Realtime TURN) or your own `coturn`. Put the values in `.env`: `EXPO_PUBLIC_TURN_URLS`, `EXPO_PUBLIC_TURN_USERNAME`, `EXPO_PUBLIC_TURN_CREDENTIAL`. Optional `EXPO_PUBLIC_STUN_URLS` replaces the default Google STUN servers. |
| Ringing while the app is closed | Needs the push relay from 1.5 (re-deploy `server/`: it now watches `calls`) and a build made after this change so the Android "Calls" channel exists. |
| Optional cleanup | Calls and ICE candidates carry an `expireAt` field (24 h). Firestore Console > Indexes > TTL: add a policy on `expireAt` for collection groups `calls` and `candidates` to have them deleted automatically. Without it they simply stay. |

**Behaviour**
- Ringing lasts 45 s, then the call is marked missed. A ringing call older than 75 s is ignored, so a caller whose app died never rings forever.
- A dropped connection gets 15 s to recover before the call ends.
- If you are on a call, a second caller is declined and you get a toast.
- Push notifications for calls honour the account-wide notification switch but **not** per-chat mute.
- Leaving the call screen hangs up.

**Known limits**
- There is no native call UI (CallKit / Android ConnectionService). A call that arrives while the app is closed shows as a notification; tapping it opens the chat and, if the call is still ringing, the Accept / Decline screen appears. It will not ring like the phone app while the device is locked.
- No speaker/earpiece toggle, no group calls, and no "missed call" line in the chat history yet.
- TURN credentials in `EXPO_PUBLIC_*` ship inside the app, so anyone who unpacks it can use your TURN server. Fine for testing; for production have the relay hand out short-lived credentials instead.
- **Not verified on a device.** The signalling logic and call-state rules are unit tested (`npm run test:unit`, `cd server && npm test`), the app bundles, and the Firestore rules for calls are written but not run against the emulator. Whether audio/video actually connects on react-native-webrtc 124 with React Native 0.86 needs a real two-phone test.
- Web is not a supported target of this project (it has no `react-native-web` dependency), and calls are not available there.

## 2. Data model (Firestore)

| Path | Purpose |
|------|---------|
| `users/{uid}` | Public profile: `username`, `usernameLowercase`, `profileImageUrl`, `status`, `theme` |
| `users/{uid}/private/settings` | Owner-only: `mutedChats[]`, `notificationsEnabled`, `expoPushTokens[]` |
| `conversations/{id}` | `participantIds[]`, `isGroup`, `groupName`, `createdBy`, last-message summary, `hiddenBy[]`, `readState{uid:{deliveredAt,readAt}}`, `unread{uid:n}` |
| `pushTokens/{token}` | Which account is signed in on a device (`uid`, `platform`, `updatedAt`). Write-only for clients; read by the push relay |
| `calls/{id}` | One call: `callerId`, `calleeId`, `participantIds`, `type` (audio/video), `status` (ringing, accepted, declined, cancelled, missed, ended), `offer`, `answer`, `createdAt`, `expireAt` |
| `calls/{id}/candidates/{id}` | ICE candidates trickled by either side (`from`, `candidate`, `sdpMid`, `sdpMLineIndex`) |
| `conversations/{id}/messages/{id}` | `type`, `text`, `media`, `senderId`, `replyTo`, `forwarded`, `deletedFor[]`, `deletedForEveryone`, `createdAt` |

Storage paths: `chats/{conversationId}/{uid}/{file}`, `avatars/{uid}/{file}`.

1-on-1 chats use the id `<uidA>_<uidB>` (sorted), so two people can never end up with two chats.

## 3. Still outstanding

| Feature | What it needs |
|---------|---------------|
| Google / phone sign-in (FR-01) | Sign-in is currently username + password (stored as a made-up `@syph.com` email). Google and phone sign-in need OAuth client IDs (Firebase Console > Authentication > Sign-in method), the SHA-1/SHA-256 fingerprints of your build keys, and a development build. Real-email sign-in and password reset need the same console work. Not built yet. |
| Search across full chat history (FR-11) | In-chat search covers the messages loaded on screen. Firestore has no full-text search; searching all history needs an external service (Algolia, Typesense, Meilisearch) and a small indexing function. |
