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
- **Sign-up and username changes need the latest rules.** They claim the name in a `usernames` registry that only the new `firestore.rules` allow. With old rules published, sign-up stops with "Could not check username availability" instead of creating a half-made account.
- Chats now use a `participantIds` field. **Conversations created by the old build do not have it and will not appear.** Recreate your test chats from the Add tab.
- The rules were written and re-reviewed by hand but **have not been executed against the emulator** (the emulator download is blocked in the build environment). Run the rules tests once; if a case fails, tell me which one.

### 1.2 Environment variables (`.env`, see `.env.example`)

| Variable | Where to find it |
|----------|------------------|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Console > Project settings > Your apps > Web app |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | same |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | same |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | same |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | same |
| `EXPO_PUBLIC_GIPHY_API_KEY` (optional) | https://developers.giphy.com/ > Create an app (SDK/API). Without it the GIF picker shows a "not set up" message; everything else works. |

These ship inside the app bundle, so they are client config, not secrets. Access control is the rules files.

### 1.3 Expo Go

The project is on Expo SDK 57, which matches the current Expo Go from the store. After pulling: `npm install` then `npx expo start -c --go` (the `--go` flag opens it in Expo Go).

`expo-dev-client` is installed (needed for the development build in 1.5 and 1.7). Because of it, a plain `npx expo start` now targets the development build; use `--go` whenever you want Expo Go. Expo Go cannot do closed-app push or calls.

### 1.4 Media (removed)

SYPH no longer uploads files, so **no Firebase Storage, no bucket and no billing plan are needed**. Chats carry text, stickers (emoji) and GIFs (a Giphy link, see `EXPO_PUBLIC_GIPHY_API_KEY` in 1.2). Profiles show an initial instead of a photo and have no status line.

| Left over from before | What to do |
|-----------------------|------------|
| Old photo / video / voice / document messages | They stay in the chat as a grey "Photo (no longer available)" line. Nothing to do. |
| Storage bucket or rules in the Firebase Console | Can be ignored or deleted. The app never touches them. |
| Camera and microphone permissions | Still requested, but only for audio and video calls (1.7). |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | No longer read. Delete it from `.env` / EAS secrets if you like. |

### 1.5 Push notifications while the app is closed (FR-10)

In-app toasts and unread badges work everywhere, including Expo Go. Alerts while the app is **closed** need the steps below. No server, hosting or payment is involved: when you send a message or place a call, your phone asks Expo's free push service to notify the other person's phone (default `EXPO_PUBLIC_PUSH_MODE=client`).

| Step | How | Cost |
|------|-----|------|
| Re-publish `firestore.rules` | Adds `userPush` and lets signed-in users look up one `pushTokens` entry (same as 1.1). Without it, push silently does nothing. | Free |
| Build the app (not Expo Go) | Remote push does not work in Expo Go or on simulators. `eas build --profile development --platform android` for testing, or `--profile preview` for an installable APK. iOS needs an Apple developer account. | Free (EAS free tier queues builds) |
| FCM credentials (Android) | Firebase Console > Project settings > Service accounts > Generate new private key, then `eas credentials` > Android > Google Service Account Key for FCM V1 and upload it. Guide: https://docs.expo.dev/push-notifications/fcm-credentials/ . Without this the build installs fine but no push arrives. | Free |
| Allow notifications | Both people sign in once on the new build and accept the notification permission (Android 13+ asks). The app saves the device at that point. | Free |
| Phone settings | On some phones (Xiaomi, Oppo, Vivo, Samsung power saving) set SYPH battery use to "Unrestricted" or allow auto-start, otherwise the system kills delivery when the app is closed. | Free |

**Limits of the free approach (accepted trade-offs)**
- The *sender's* phone must be online at the moment of sending. A message written offline is pushed when it finally uploads.
- Any signed-in user can read another user's device tokens (one document at a time, never a list). That is what lets a phone notify another phone without a server. A malicious signed-in user could spam someone's notifications. Fine for friends and family, not for a public app.
- Calls ring as a notification with the ringtone and vibration of the "Calls" channel, not as a full-screen ringing screen. Tapping it opens the chat, and the Accept / Decline screen appears if the call is still ringing (30 seconds).
- A caller who hangs up leaves the notification in the tray until it is dismissed. No "missed call" push is sent.
- Group changes (added, renamed, removed, left) do not push in this mode. New group *messages* do.
- Notification text includes the message preview. There is no hide-preview switch in this mode.
- Not yet tested on a real phone: Expo's push endpoint could not be reached from the build environment, so the first real test is yours (send a message to a second phone with the app swiped away).

**Optional relay (not needed, needs a host that stays on).** `server/` is a Node 22.9+ service that watches Firestore and pushes for everything, including group changes. Only use it if you have a free always-on host. Set `EXPO_PUBLIC_PUSH_MODE="relay"` in `.env` so the app stops sending pushes itself, otherwise every notification arrives twice. Steps and delivery rules: `server/README.md`. Needs a Firebase service-account key in `server/.env` (full database access, never commit it) and optionally `EXPO_ACCESS_TOKEN` and `PUSH_HIDE_PREVIEW=1`. Run **one** instance.

`EXPO_PUBLIC_PUSH_MODE`: `client` (default) / `relay` / `off`.

### 1.6 Offline use (NFR-07)

Nothing to set up. Firestore keeps a local cache, so chats you have already opened stay readable offline and messages you send are queued and delivered when the connection returns (they show a clock icon until then). A slim banner appears on the Chat and conversation screens while the device is offline.

### 1.7 Audio and video calls (FR-06)

1-to-1 calls only. Media goes phone to phone over WebRTC; Firestore carries the handshake (`calls/{id}`). Everything else in the app works without any of this.

| Step | How |
|------|-----|
| Re-publish `firestore.rules` | It now includes `calls` and `calls/{id}/candidates` (same as 1.1). |
| Development build | WebRTC is a native module, so calls **do not work in Expo Go** (the call buttons explain this in a toast). `npm install`, then `eas build --profile development --platform android` or `npx expo run:android`. The camera/microphone permissions and the WebRTC config plugin are already in `app.json`. |
| Regenerate native folders | `android/` and `ios/` are git-ignored and rebuilt from `app.json` (`npx expo prebuild --clean`). EAS does this for you. |
| TURN server (strongly advised) | STUN alone connects phones on friendly networks only. Mobile data and many Wi-Fi networks need a TURN relay. Options: a hosted service (Twilio Network Traversal, Metered, Cloudflare Realtime TURN) or your own `coturn`. Put the values in `.env`: `EXPO_PUBLIC_TURN_URLS`, `EXPO_PUBLIC_TURN_USERNAME`, `EXPO_PUBLIC_TURN_CREDENTIAL`. Optional `EXPO_PUBLIC_STUN_URLS` replaces the default Google STUN servers. |
| Ringing while the app is closed | Works through the push set-up in 1.5 (a build that has the Android "Calls" channel). |
| Optional cleanup | Calls and ICE candidates carry an `expireAt` field (24 h). Firestore Console > Indexes > TTL: add a policy on `expireAt` for collection groups `calls` and `candidates` to have them deleted automatically. Without it they simply stay. |

**Behaviour**
- Ringing lasts 45 s, then the call is marked missed. A ringing call older than 75 s is ignored, so a caller whose app died never rings forever.
- A dropped connection gets 15 s to recover before the call ends.
- If you are on a call, a second caller is declined and you get a toast.
- Push notifications for calls honour the account-wide notification switch but **not** per-chat mute.
- Leaving the call screen hangs up.

**Known limits**
- There is no native call UI (CallKit / Android ConnectionService). A call that arrives while the app is closed shows as a notification; tapping it opens the chat and, if the call is still ringing, the Accept / Decline screen appears. It will not ring like the phone app while the device is locked.
- No group calls and no "missed call" line in the chat history yet.
- Speaker/earpiece: voice calls start on the earpiece and video calls on the loudspeaker, with a toggle on the call screen. It uses `react-native-incall-manager` (react-native-webrtc has no audio routing), which is a native module, so it needs a **new development build** and is **unverified on a device**. It also switches to a wired or Bluetooth headset when one is connected and turns the screen off when a voice call is held to the ear. Bluetooth routing on Android 12+ needs the BLUETOOTH_CONNECT permission, which the app does not request yet, so a Bluetooth headset may not be picked up.
- TURN credentials in `EXPO_PUBLIC_*` ship inside the app, so anyone who unpacks it can use your TURN server. Fine for testing; for production have the relay hand out short-lived credentials instead.
- **Not verified on a device.** The signalling logic and call-state rules are unit tested (`npm run test:unit`, `cd server && npm test`), the app bundles, and the Firestore rules for calls are written but not run against the emulator. Whether audio/video actually connects on react-native-webrtc 124 with React Native 0.86 needs a real two-phone test.
- Web is not a supported target of this project (it has no `react-native-web` dependency), and calls are not available there.

### 1.8 Accounts: email sign-in, password reset, names (FR-01, FR-02)

There are two kinds of account, and both keep working:

| Kind | Signs in with | Password reset |
|------|---------------|----------------|
| Username-only (all accounts made before this change, and sign-ups that leave the email box empty) | Username + password (the app uses `<username>@syph.com` behind the scenes; that is not a real mailbox) | Not possible |
| Email account | The email + password | "Forgot password?" on the login screen sends a reset link |

An existing username-only account can add a real email under **Me > Account email**. Firebase mails a confirmation link to the new address and switches the sign-in email only after it is opened, so a typo cannot lock anyone out. After that the person signs in with the email.

| Step | How |
|------|-----|
| Email/Password provider | Firebase Console > Authentication > Sign-in method > Email/Password must be **enabled**. It already is if sign-in works today. |
| Re-publish `firestore.rules` | Adds the `usernames` registry and the group-activity check (same as 1.1). |
| Optional: email wording | Console > Authentication > Templates lets you edit the verification, reset and email-change messages and the sender name. Mails often land in spam until you set up a custom sender domain. |

Things to know:
- Usernames are now 3-20 letters, digits, `.` or `_`, and unique across both kinds of account. Existing usernames are not re-checked until someone changes theirs.
- A **name** (display name, up to 40 characters) can be set under Me. Contacts see it in chat lists, chat headers and user search instead of the `@username`. It is read live, so a change shows up everywhere within a few minutes. Group member lists and message senders still show usernames.
- If Firebase's "email enumeration protection" is on (the default for new projects), it refuses to switch a username-only account's hidden email when that person changes their username. The app then asks them to add a real email first. Email accounts can change their username freely.
- **Not built:** Google and phone sign-in. See section 3.

### 1.9 Typing indicator

Shows "typing…" under the name in a 1-on-1 chat and "Bob is typing…" / "3 people are typing…" in a group, while that chat is open. Nothing to set up beyond re-publishing `firestore.rules` (1.1); it works in Expo Go.

- Cost: while someone types, their phone writes one tiny document at most every 3 seconds and deletes it when they stop or send. Roughly 10 writes per typed message against Firestore's free 20,000 writes per day, so a few hundred typed messages a day is fine, thousands is not.
- It only runs while the chat is open, the app is in the foreground and the phone is online. Someone who loses signal or closes the app stops showing after about 6 seconds.
- Not shown in the chat list, and there is no switch to turn it off yet.

## 2. Data model (Firestore)

| Path | Purpose |
|------|---------|
| `users/{uid}` | Public profile: `username`, `usernameLowercase`, `displayName` (optional), `theme`. Old `profileImageUrl` / `status` fields may still exist on accounts and are ignored |
| `users/{uid}/private/settings` | Owner-only: `mutedChats[]`, `notificationsEnabled`, `expoPushTokens[]` |
| `conversations/{id}` | `participantIds[]`, `isGroup`, `groupName`, `createdBy`, last-message summary, `groupActivity` (latest rename / removal / leave, read by the push relay), `hiddenBy[]`, `readState{uid:{deliveredAt,readAt}}`, `unread{uid:n}` |
| `usernames/{lowercase name}` | Claim registry: `uid`, `createdAt`. One document per name, create-once, so two accounts cannot take the same name. Readable one at a time, never listed |
| `pushTokens/{token}` | Which account is signed in on a device (`uid`, `platform`, `updatedAt`). A sender checks it before using a token; readable one at a time, never listed |
| `userPush/{uid}` | Copy of the push-relevant settings: `tokens[]` (newest 5), `notificationsEnabled`, `mutedChats[]`. Written only by the owner, readable one at a time by signed-in users so a sender's phone can notify them |
| `calls/{id}` | One call: `callerId`, `calleeId`, `participantIds`, `type` (audio/video), `status` (ringing, accepted, declined, cancelled, missed, ended), `offer`, `answer`, `createdAt`, `expireAt` |
| `calls/{id}/candidates/{id}` | ICE candidates trickled by either side (`from`, `candidate`, `sdpMid`, `sdpMLineIndex`) |
| `conversations/{id}/messages/{id}` | `type` (`text`, `gif`, `sticker`; the rules refuse anything else), `text`, `media` (GIF link only), `senderId`, `replyTo`, `forwarded`, `deletedFor[]`, `deletedForEveryone`, `createdAt` |
| `conversations/{id}/typing/{uid}` | "I am typing" marker: `typing: true`, `at` (server time). Members read, each writes only their own, deleted when they stop |


1-on-1 chats use the id `<uidA>_<uidB>` (sorted), so two people can never end up with two chats.

## 3. Still outstanding

| Feature | What it needs |
|---------|---------------|
| Google sign-in (FR-01) | OAuth client IDs (Firebase Console > Authentication > Sign-in method > Google, plus Web/Android/iOS client IDs from Google Cloud), the SHA-1/SHA-256 fingerprints of your build keys, and a development build. Not built yet. |
| Phone sign-in (FR-01) | Firebase's JS SDK cannot do phone sign-in cleanly in React Native (it needs reCAPTCHA or the native Firebase SDK), and SMS may need a paid plan. Decide whether it is required before anyone builds it. Not built. |
| Search across full chat history (FR-11) | In-chat search covers the messages loaded on screen. Firestore has no full-text search; searching all history needs an external service (Algolia, Typesense, Meilisearch) and a small indexing function. |
