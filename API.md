# API.md - what SYPH needs from you

Everything the app depends on that lives outside the code: console steps, keys, services. Section 0 is the Phase 4 report (what happened, what is left for you). Sections 1 to 3 are the detail behind it.

## 0. Phase 4 report (Oct 24, 2026)

**Total money needed from you: 0.** Nothing here uses Firebase Storage, Blaze, hosting, TURN or an Apple developer account.

### 0.1 What happened

| Phase | What was done | PR | State |
|-------|---------------|----|-------|
| 1 | Push while the app is closed, for messages and calls. The sender's phone calls Expo's free push service, so there is no server | #3, #5 | Merged |
| 2 | Removed uploads (photo, video, document), voice notes, camera upload, Me-tab status and profile pictures. No file storage is used any more | #3 | Merged |
| 2.5 | Typing indicator ("typing...", "Bob is typing...") | #3 | Merged |
| Extra | Speaker / earpiece toggle in audio and video calls | #2 | Merged (confirmed present) |
| Extra | Camera off shows an opaque panel with the username instead of a frozen frame; muted-mic icon for the other person | #4, #5 | Merged |
| Extra | Stickers removed (old sticker messages stay readable) | #6 | **Open**, base fixed to `main` |
| 3 | Group voice and video calls: 4 people for video, 6 for voice, Join bar, ring and push | #7 | **Open**, waiting for your phone test |
| 4 | This report, `JOURNEY.md` and `MEMORY.md` updated | Phase 4 PR | Open |
| 5 | Live location sharing, shown on a free OpenStreetMap map. Works while SYPH is open on the sharer's phone (see 1.11) | Phase 5 PR | Built in PR #11 (`claude/phase-5-location`), then paused at your request. Do not merge #11 until you restart it in a later update. The old parked branch `claude/live-location` is superseded |

### 0.2 What I checked, and what I could not

| Checked here (on `main` + #6 + #7 merged) | Result |
|-------------------------------------------|--------|
| TypeScript (`npm run typecheck`) | Clean |
| Unit tests (`npm run test:unit`) | 138 pass |
| Relay tests (`cd server && npm test`) | 55 pass |
| Android bundle (`npx expo export --platform android`) | Builds |
| Merge of #6 and #7 onto `main` | No conflicts |

| Could not check | Why | So |
|-----------------|-----|----|
| Push actually arriving | `exp.host` is blocked from my environment | Your test, 0.3 step 8 |
| 1-to-1 and group calls, speaker routing, mute / camera-off UI | WebRTC needs phones | Your test, 0.3 step 8 |
| `firestore.rules` | The emulator cannot be downloaded here. Tests are written but have never run | Optional, 0.3 step 4 |
| Typing indicator on a device | Needs two phones | Your test |

### 0.3 What I need from you, in order

| # | Task | Where / how | Effort | Cost | Unlocks |
|---|------|-------------|--------|------|---------|
| 1 | Merge the PR for this update (Update button, location from the long-press on Send, background sharing) | GitHub. Its base is `main`: check that before merging. It also closes PR #11 | 1 min | Free | Everything below |
| 2 | Pull `main` and run `npm ci` | Command Prompt, after the merge | 3 min | Free | A clean install and EAS builds |
| 3 | Publish `firestore.rules` (changed again: location pins and `appConfig`) | Firebase Console > Firestore Database > Rules > paste > Publish (1.1) | 2 min | Free | Messages, push lookup, calls, typing, group calls. Without it, most things fail quietly |
| 4 | Run the rules tests (optional) | `cd tests/firestore-rules && npm install && npm test`. Needs Java 11+ and network for the first emulator download. Tell me any failing case | 10 min | Free | Confidence in the rules |
| 5 | Store your Firebase values in EAS, once | In Command Prompt: `copy .env .env.local`, then `eas env:push development --path .env.local`, and the same for `preview` and `production`. Do this **before** you pull the PR that stops tracking `.env`: that pull deletes your local `.env` (your `.env.local` copy stays and works for local runs). EAS skips git-ignored files, so this is how builds get the values. A build with values missing now stops at its start with a clear message instead of crashing on launch. | 5 min | Free | Builds that work |
| 6 | Upload the FCM V1 key | Firebase Console > Project settings > Service accounts > Generate new private key, then `eas credentials` > Android > Google Service Account Key for FCM V1 (1.5) | 10 min | Free | Push while the app is closed |
| 7 | Build the new Android app (new libraries, so a new APK is required) | `eas login`, then `eas build --profile preview --platform android` for an installable APK (simplest for testing), or `--profile development` for the dev client. Free plan: a monthly build limit and a queue | 15-45 min, mostly waiting | Free | Push, calls, group calls (none of them work in Expo Go), and the theme icon (#10) |
| 8 | Test on 2-3 phones | Install the APK, sign in on each, allow notifications, set battery to "Unrestricted" (Xiaomi, Oppo, Vivo, Samsung). Then the push test in 1.5, the 9-row group call checklist in 1.10 and the 8-row live location checklist in 1.11 | 30-60 min | Free | Tells me what to fix |
| 9 | Firestore TTL policies (optional) | Console > Firestore > Indexes > TTL on `expireAt` for collection groups `calls`, `candidates`, `media`, `peers`, `signals` (1.7, 1.10). Without them old call documents just stay | 5 min | Free | Tidy database |
| 10 | Giphy key (optional) | developers.giphy.com, then `EXPO_PUBLIC_GIPHY_API_KEY` in `.env` (1.2). Without it the GIF picker says "not set up". `.env` is no longer committed, but the old key is in git history: regenerate it on giphy.com if you want it private | 5 min | Free | GIFs |
| 11 | Set up the Update button | Firebase Console > Firestore Database > Data > Start collection `appConfig`, document id `latest`, fields `latestBuild` (number: the build number of the newest APK, see 1.12), `apkUrl` (string, the build's download link) and `notes` (string, optional). Repeat the edit after every new APK (1.12) | 5 min | Free | The button offering new APKs |

### 0.4 Install and build problems on `main` ("build-test", found Oct 26)

The EAS APK build kept failing. A real Android compile cannot run in the build environment (no Android SDK, and Google, Maven and Gradle hosts are blocked), so I reproduced what EAS does before the compile (clean `npm ci`, then Android prebuild) and ran `expo-doctor`. I do not have your EAS logs, so this is a diagnosis, not a confirmed cause.

| # | Problem on `main` | Why it breaks a build | Fix (PR #9) |
|---|-------------------|-----------------------|-------------|
| 1 | `npm ci` stops with ERESOLVE. `react-native-drawer-layout` needs `react-native-reanimated`, npm picks 4.7.1, which needs `react-native-worklets` 0.13.x, but `package.json` pins `^0.10.4` | EAS fails at "Install dependencies", before any compile. Your eight "fix:" commits on Oct 21-22 (worklets 0.10 to 0.13 and back) were chasing this | Pin `react-native-reanimated` to `4.5.1`, which is the version Expo SDK 57 itself lists and works with worklets 0.10.x. Worklets 0.13 was the wrong direction |
| 2 | `expo-font` is not in `package.json`. `@expo/vector-icons` and `expo-symbols` accept any version, so npm installs **58.0.9 (an SDK 58 package)** at the top level, beside the SDK 57 copy (57.0.4) inside `expo` | Gradle autolinking takes the top-level copy, so an SDK 58 native module is compiled against SDK 57. `expo-doctor` warns this causes "unexpected build errors". **The most likely reason a build fails after the install step, not proven** | Declare `expo-font` at `~57.0.4`. One copy remains |

Checked on a clean `npm ci` of the fixed branch: one `expo-font`, `expo-doctor` duplicate check passes, typecheck, unit tests, `expo prebuild` for Android, Android bundle. I also scanned the Android sources of the other native libraries (webrtc, incall-manager, async-storage, webview) for React Native classes that RN 0.86 removed, and found none.

**Not checked:** the Gradle compile, and an EAS build. If a build still fails after #9, send the log link for the failing build (expo.dev > your project > Builds > the failed one > "Run gradlew") and I will read the actual error.

Left alone on purpose, both flagged by `expo-doctor` but neither a conflict: `@react-native-async-storage/async-storage` stays at 1.24.0 (Firebase 11's Auth lists `^1.18.1` as its peer; Expo lists 2.2.0), and `react-native-worklets` stays `^0.10.4` (Expo lists 0.10.1). Also on `main`: TypeScript 6.0.3, and `@variant-systems/expo-dynamic-app-icon` (a config plugin, so it needs a native build; PR #10 makes the icon follow the theme).

`.env` is no longer committed (it is git-ignored). It holds only client-side Firebase values and the Giphy key. For local runs keep it as `.env.local`; EAS builds read the same values from EAS environment variables (`eas env:push`, see 1.2). The old values remain in git history.

**Update, Oct 27:** the APK built and installed, so the Gradle compile is fine. The next failure was a launch crash, `auth/invalid-api-key`: EAS skips git-ignored files and `.env` is git-ignored, so the build had no Firebase values. Fixed first with a `base` profile in `eas.json`, then moved to EAS environment variables so the repo holds no values.

### 0.5 Left alone on purpose

| Item | Why |
|------|-----|
| TURN server | You declined (it costs money). Some network pairs cannot connect: a 1-to-1 call ends with "failed", a group tile shows "Can't connect" |
| iOS | Dev builds and push on iPhone need the paid Apple developer account, so Android only |
| Push relay (`server/`) | Not needed: it needs an always-on host |
| Google and phone sign-in, full-history search | Section 3 |

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

**Where they live now.** Local runs read `.env.local` (git-ignored). EAS skips git-ignored files, so builds read them from EAS environment variables, one set per environment (`development`, `preview`, `production`; each profile in `eas.json` names its own). Set them once from your local file:

```
copy .env .env.local
eas env:push development --path .env.local
eas env:push preview --path .env.local
eas env:push production --path .env.local
```

If you change a value, run the same commands again and answer yes to overwrite. `scripts/check-eas-env.cjs` runs at the start of every EAS build and stops it with a clear message if a Firebase value is missing.

### 1.3 Expo Go

The project is on Expo SDK 57, which matches the current Expo Go from the store. After pulling: `npm install` then `npx expo start -c --go` (the `--go` flag opens it in Expo Go).

**Startup hand-off.** The logo is removed only when nothing on screen can change afterwards: the signed-in state is known, the theme saved on the phone is read, the icon font is loaded and the first real screen (chat list, login or intro) is already open underneath, plus 0.15 s for it to be drawn (`src/utils/splash.ts`, `src/hooks/useSplashGate.ts`, `src/components/StartupStack.tsx`). Screen slide animations are off until the logo is gone, and `app.json` sets a black window background (`backgroundColor`), so no white frame can show. The 8 s limit still applies. This changes `app.json`, so it needs a new build, not a reload. **Test on the installed build, from a fully closed app, in light and dark themes:** you should see the logo, then the first screen with its icons already drawn, with no spinner, no colour change and no sliding in between. Nothing to set up and no cost.

`expo-dev-client` is installed (needed for the development build in 1.5 and 1.7). Because of it, a plain `npx expo start` now targets the development build; use `--go` whenever you want Expo Go. Expo Go cannot do closed-app push or calls.

**Splash screen.** The splash is the SYPH wordmark. `assets/images/splash-icon.png` is a white wordmark on a transparent square (the wordmark is about half the square's width, so Android 12's round splash mask never clips it). The `expo-splash-screen` entry of `app.json` shows it on black, in light and dark mode (`imageWidth` 288). It stays up until the signed-in state is known, for at least 0.7 s, and is removed after 8 s at the latest, so a stuck sign-in check cannot leave it on screen (`src/utils/splash.ts`). **Expo Go shows the app icon instead of the splash, and a development build does not reflect every splash setting, so judge it on an installed APK** (`eas build --profile preview --platform android`). To change the picture, replace `splash-icon.png` and keep the wordmark about half the square's width. Changing the splash needs a new build, not a reload. The old four-photo picture is kept, unused, as `assets/images/splash_icon_new.png`. Nothing to set up and no cost.

### 1.4 Media (removed)

SYPH no longer uploads files, so **no Firebase Storage, no bucket and no billing plan are needed**. Chats carry text and GIFs (a Giphy link, see `EXPO_PUBLIC_GIPHY_API_KEY` in 1.2). Profiles show an initial instead of a photo and have no status line.

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
| Notification icon | The small icon in the status bar and in the notification is `assets/images/notification-icon.png`, made from `favicon5.png`. Android uses only its shape (it must be white on transparent, 96x96); the status bar draws it white or grey by itself, and in the pulled-down shade it takes the `color` of the `expo-notifications` entry in `app.json` (black). Changing either needs a new APK. Without an icon Android shows the app's launcher icon instead. | Free |

**Limits of the free approach (accepted trade-offs)**
- The *sender's* phone must be online at the moment of sending. A message written offline is pushed when it finally uploads.
- Any signed-in user can read another user's device tokens (one document at a time, never a list). That is what lets a phone notify another phone without a server. A malicious signed-in user could spam someone's notifications. Fine for friends and family, not for a public app.
- Calls ring as a notification with the ringtone and vibration of the "Calls" channel, not as a full-screen ringing screen. Tapping it opens the chat, and the Accept / Decline screen appears if the call is still ringing (30 seconds).
- A caller who hangs up leaves the ring notification in the tray until it is dismissed. A second notification, "Missed voice call" or "Missed video call", follows from the caller's phone (1.7).
- Group changes (added, renamed, removed, left) do not push in this mode. New group *messages* do.
- Notification text includes the message preview. There is no hide-preview switch in this mode.
- Not yet tested on a real phone: Expo's push endpoint could not be reached from the build environment, so the first real test is yours (send a message to a second phone with the app swiped away).

**Optional relay (not needed, needs a host that stays on).** `server/` is a Node 22.9+ service that watches Firestore and pushes for everything, including group changes. Only use it if you have a free always-on host. Set `EXPO_PUBLIC_PUSH_MODE="relay"` in `.env` so the app stops sending pushes itself, otherwise every notification arrives twice. Steps and delivery rules: `server/README.md`. Needs a Firebase service-account key in `server/.env` (full database access, never commit it) and optionally `EXPO_ACCESS_TOKEN` and `PUSH_HIDE_PREVIEW=1`. Run **one** instance.

`EXPO_PUBLIC_PUSH_MODE`: `client` (default) / `relay` / `off`.

### 1.6 Offline use (NFR-07)

Nothing to set up. Firestore keeps a local cache, so chats you have already opened stay readable offline and messages you send are queued and delivered when the connection returns (they show a clock icon until then). A slim banner appears on the Chat and conversation screens while the device is offline.

### 1.7 Audio and video calls (FR-06)

1-to-1 calls (this section) and group calls (1.10). Media goes phone to phone over WebRTC; Firestore carries the handshake (`calls/{id}`). Everything else in the app works without any of this.

| Step | How |
|------|-----|
| Re-publish `firestore.rules` | It now includes `calls`, `calls/{id}/candidates` and `calls/{id}/media` (same as 1.1). Without the `media` rule, a camera turned off still looks frozen to the other person and the muted icon never appears. |
| Development build | WebRTC is a native module, so calls **do not work in Expo Go** (the call buttons explain this in a toast). `npm install`, then `eas build --profile development --platform android` or `npx expo run:android`. The camera/microphone permissions and the WebRTC config plugin are already in `app.json`. |
| Regenerate native folders | `android/` and `ios/` are git-ignored and rebuilt from `app.json` (`npx expo prebuild --clean`). EAS does this for you. |
| TURN server (optional, skipped) | Not required, and leaving it out costs nothing. Without one, calls use only the free public STUN servers: they connect on most home Wi-Fi and many mobile networks, but some pairs of networks (strict carrier, office or hotel networks) cannot reach each other and that call ends with "failed". If it ever matters, put the values in `.env`: `EXPO_PUBLIC_TURN_URLS`, `EXPO_PUBLIC_TURN_USERNAME`, `EXPO_PUBLIC_TURN_CREDENTIAL`. Optional `EXPO_PUBLIC_STUN_URLS` replaces the default Google STUN servers. |
| Ringing while the app is closed | Works through the push set-up in 1.5 (a build that has the Android "Calls" channel). |
| Optional cleanup | Calls, ICE candidates and camera-state documents carry an `expireAt` field (24 h). Firestore Console > Indexes > TTL: add a policy on `expireAt` for collection groups `calls`, `candidates` and `media` to have them deleted automatically. Without it they simply stay. |

**Behaviour**
- Ringing lasts 45 s, then the call is marked missed. A ringing call older than 75 s is ignored, so a caller whose app died never rings forever.
- A dropped connection gets 15 s to recover before the call ends.
- If you are on a call, a second caller is declined and you get a toast.
- Push notifications for calls honour the account-wide switch (Me tab > Notifications > "Mute all messages", when it is on no call alert arrives while SYPH is closed) but **not** per-chat mute.
- Leaving the call screen does not hang up any more: the call keeps running in the background (1.13). Only the hang-up button, the other person, or a lost connection ends it.

**Known limits**
- There is no native call UI (CallKit / Android ConnectionService). A call that arrives while the app is closed shows as a notification; tapping it opens the chat and, if the call is still ringing, the Accept / Decline screen appears. It will not ring like the phone app while the device is locked.
- Missed calls (1-to-1): when a ring ends unanswered (the caller hung up, or 45 s passed), the caller's phone sends a "Missed voice call" / "Missed video call" notification. It uses the messages channel (the normal message sound, not the ringtone), obeys "Mute all messages" like the ring does, and tapping it opens the chat. If SYPH is open you get a "Missed call" alert at the top of the screen instead; tapping it opens the chat. JavaScript only: no new APK. Not covered: group calls and a "missed call" line inside the chat history. If the caller's phone is offline or SYPH is closed during the ring, no notice is sent (the same trade-off as every push here).
- Muted: when the other person mutes their microphone, a small muted-microphone icon appears. In a video call it sits at the bottom-left over their video; if their camera is off, or it is a voice call, it sits on their profile circle instead. It travels in the same per-person document as the camera state (`calls/{id}/media/{uid}`), so it needs the same rules from 1.1. Your own mute is shown by the highlighted Mute button.
- Camera off: when someone turns their camera off in a video call, both screens stop showing the video. The other person sees an opaque screen with that person's username and "Camera off", and the person sees their own small preview replaced by an opaque tile with their username. The camera state travels as one tiny document per person (`calls/{id}/media/{uid}`), so it needs the rules from 1.1.
- Audio route (speaker, earpiece, earphones): voice calls start on the earpiece and video calls on the loudspeaker. The audio button on the call screen steps through what the phone can use right now: Bluetooth earphones, a wired headset, speaker, earpiece (the icon shows which). Earphones that are already connected are used automatically, and the button follows them being plugged in or paired during the call. It works the same in 1-to-1 and group calls, voice and video. It uses `react-native-incall-manager`, which is a native module, so it needs a **new development build or APK**, and it is **unverified on a device**. **Bluetooth earphones need the Android 12+ "Nearby devices" permission** (`BLUETOOTH_CONNECT`): `app.json` now declares it and the app asks once when a call starts. That permission is part of the app manifest, so it needs a new APK (the version stays 7.5.5; see 1.12 for how a new APK is offered); the button itself can go out with `eas update`, but Bluetooth stays missing on an older APK. If you tap "Not now", wired headsets, speaker and earpiece still work; allow it later in Android Settings > Apps > SYPH > Permissions > Nearby devices.
- TURN credentials in `EXPO_PUBLIC_*` ship inside the app, so anyone who unpacks it can use your TURN server. Fine for testing; for production have the relay hand out short-lived credentials instead.
- **Not verified on a device.** The signalling logic and call-state rules are unit tested (`npm run test:unit`, `cd server && npm test`), the app bundles, and the Firestore rules for calls are written but not run against the emulator. Whether audio/video actually connects on react-native-webrtc 124 with React Native 0.86 needs a real two-phone test.
- Web is not a supported target of this project (it has no `react-native-web` dependency), and calls are not available there.

**Earphone test (new build; Bluetooth earphones and, if you have them, a wired headset)**

| # | Do this | Expect |
|---|---------|--------|
| 1 | Connect Bluetooth earphones, then start a voice call | Android asks to allow "Nearby devices": Allow. Sound comes out of the earphones within a few seconds, and the audio button shows the Bluetooth icon |
| 2 | Tap the audio button | Sound moves to the speaker, then the earpiece, then back to the earphones. The icon changes each time |
| 3 | Start a video call with the earphones already connected | Sound goes to the earphones, not the loudspeaker |
| 4 | Plug in a wired headset during a call, then unplug it | Sound moves to the headset, then back to the earpiece or speaker |
| 5 | Repeat 1 and 2 in a group call | Same results |
| 6 | Tap "Not now" on the permission (clear the app's data to see it again) | The call works; Bluetooth earphones are not offered, wired ones still are |

**Missed call test (two phones, A calls B)**

| # | Do this | Expect |
|---|---------|--------|
| 1 | B closes SYPH completely. A calls B and lets it ring out (45 s) | B gets "Missed voice call" from A (after the ring notification). Tapping it opens the chat |
| 2 | Same, but A hangs up after 5 s | B gets "Missed voice call" |
| 3 | A video-calls B and hangs up | The notification says "Missed video call" |
| 4 | B has SYPH open. A calls and hangs up | The ring screen disappears and a "Missed call" alert shows at the top. Tapping it opens the chat |
| 5 | B turns on "Mute all messages", A calls and hangs up | No notification |
| 6 | B declines or answers a call | No missed-call notice |

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

### 1.10 Group voice and video calls

Open a group chat: the header has a phone and a video icon. Tap one to start a call, or to join one that is already going (a "Voice / Video call in progress · 2 people in the call · Join" bar shows under the header while it runs). Members whose app is open get the full-screen Accept / Decline ring for 45 seconds; members whose app is closed get a notification (not if they muted that group, but the Join bar is still there when they open it).

| Step | How | Cost |
|------|-----|------|
| Re-publish `firestore.rules` | Adds the group call pointer on `conversations/{id}` and `conversations/{id}/groupCalls/{callId}/peers` and `/signals` (same as 1.1). Without it group calls fail with "Could not connect to the call". | Free |
| Build the app (not Expo Go) | Same as 1-to-1 calls (1.7): WebRTC is a native module. Group calls reuse the camera, microphone and audio-routing set-up, so no new permissions. | Free |
| TURN server | Skipped on purpose (hosted TURN costs money). Not needed. Without it, some people may be unable to connect to each other on certain networks: their tile shows "Can't connect" while everyone else still works. Group calls need more links than 1-to-1 (3 to 6 for 3 to 4 people), so you will notice this more. To fix it later, see the TURN row in 1.7. | Free (nothing to do) |
| Optional cleanup | Presence and handshake documents carry `expireAt` (24 h). Firestore Console > Indexes > TTL: add a policy on `expireAt` for collection groups `peers` and `signals`. Without it they stay (small). | Free |

**How it works:** every phone connects to every other phone (a "mesh"). That is why there is a limit: **4 people for video, 6 for voice**. A 5th person joining a video call is told "This call is full". Video in a group is sent smaller (480x360 at 15 fps) to keep phones cool.

**Firestore use (free daily quota is 20,000 writes and 50,000 reads):** each person writes a heartbeat every 15 seconds and about 40 handshake documents per person they connect to. A one-hour 4-person call is roughly 1,000 writes and 3,000 reads in total.

**Known limits**
- Like 1-to-1 calls, there is no native ringing screen when the app is closed: it is a notification, and tapping it opens the chat with the Join bar.
- Someone whose phone loses signal drops out of the call for the others after about 45 seconds, and can join again from the bar.
- If the last person leaves, the Join bar can linger for up to about a minute before it disappears by itself.
- Any member can end the "call in progress" marker (the rules allow any member to write it). Fine for friends, not for strangers.
- No screen sharing, no adding people mid-call from inside the call screen, and calls stay alive until everyone has left (there is no host who can end it for all).
- Leaving the group call screen leaves the call running in the background (1.13). The leave button is what ends it for you.
- **Not yet tested on real phones** (WebRTC cannot run in the build environment). The handshake logic is unit tested with fake phones, and the rules tests were written but have not been run.

**Test checklist (two to four phones, new build, same group). Please also tell me which networks each phone was on when something does not connect.**

| # | Do this | Expect |
|---|---------|--------|
| 1 | A taps the voice icon in the group | A sees "Waiting for others"; B and C get a ring (app open) or a notification (app closed) |
| 2 | B accepts, then C joins from the Join bar | Everyone hears everyone; each screen has a tile per person with names |
| 3 | A video call with 3 phones | Live video tiles; turning a camera off shows an opaque tile with that person's name; muting shows a mic-off icon on their tile |
| 4 | Speaker button, mute button | Audio switches between speaker and earpiece; others see the muted icon |
| 5 | B leaves and rejoins from the Join bar | B reconnects with A and C; no duplicate tiles |
| 6 | Fifth person tries to join a video call | "This call is full" |
| 7 | Everyone leaves | The Join bar disappears within about a minute |
| 8 | Start a call while B's app is fully closed | B gets a notification from the group; tapping it opens the chat with the Join bar |
| 9 | Put one phone on mobile data and another on Wi-Fi, then call | Shows how often STUN alone is enough. A tile saying "Can't connect" is the expected no-TURN failure, not a bug |

### 1.11 Share location (hold the send button)

**Hold the send button** in any chat (it works when the box is empty too). A "Share location" popup opens, like the one in Google Maps:

| Option | What it does |
|--------|--------------|
| Map preview | Shows where you are, so you can check before sending |
| **Send your current location** | Sends one pin. It shows on a map when tapped and never moves or ends |
| **Share live location**: 15 min, 1 hour or 8 hours | A "Live location" bubble and a "Sharing" bar appear. The people in the chat see your dot move on a map until it ends. Stop it any time from the bar or the popup |
| "Keep it going" link | Turns on sharing while SYPH is closed (below) |

The first time you hold the button a tip appears ("Hold the send button to share your location"). The old location button next to GIF is gone.

**Sharing while SYPH is in the background or closed (this update).** Android needs two things: the **"Allow all the time"** location permission and a notification that stays visible while you share ("SYPH is sharing your live location"). The first time you start a live share, SYPH explains this and, if you continue, opens the Android settings page where you pick **Allow all the time**. Come back to SYPH and sharing switches to background mode by itself. If you say no, sharing still works but pauses when SYPH is closed, and resumes when you open it again. Shares are saved on the phone, so they also continue after the app is restarted, and they end on time even if the phone was off for a while.

| Step | How | Cost |
|------|-----|------|
| Re-publish `firestore.rules` | Adds location pins and the `appConfig` document (1.1, 1.12). Without it, sending a pin or starting a share fails | Free |
| New build | Adds `expo-location` (with background and foreground-service permissions), `expo-task-manager` and `react-native-webview`: a new APK is required (`eas build --profile preview --platform android`). Not available in Expo Go | Free |
| Allow location | Each person who shares allows it once. Viewers need no permission | Free |
| Map | OpenStreetMap tiles shown with Leaflet 1.9.4 (loaded from unpkg, with an integrity check). **No API key, no billing.** The map needs internet; without it the map says so and **Open in Maps** still works | Free |
| Optional cleanup | Location documents carry `expireAt` (end of share plus 24 h). Add a TTL policy on `expireAt` for collection group `locations` (same place as 1.7) | Free |

**Firestore use (free daily quota is 20,000 writes and 50,000 reads):** the sharer's phone writes a position at most every 8 seconds, and only if it moved 10 m or after a 60-second heartbeat. A phone standing still writes about once a minute. A pin is one message write.

**Known limits**
- **Background sharing is the one part I could not test.** Android makers (Xiaomi, Oppo, Vivo, Samsung, Huawei) may still stop apps to save battery: set SYPH's battery use to "Unrestricted". If the system stops SYPH, viewers see "Last updated ... ago" after 3 minutes, and the share ends on time or when SYPH is opened again.
- Battery: a live share keeps the GPS on, so it uses noticeably more battery while it runs (up to 8 hours).
- OpenStreetMap's public tile server is meant for light use (friends and family is fine). If SYPH ever grows, change `TILE_URL` in `src/utils/mapHtml.ts`.
- One live share per chat at a time. Location messages cannot be forwarded. Everyone in the chat sees it, including everyone in a group.
- A pin shows where you were at that moment. It cannot be updated, only deleted (delete for everyone removes the position).
- Only the sharer can end a share early. Signing out stops every share.
- iOS is not set up for background sharing.

**Test checklist (two phones, new build)**

| # | Do this | Expect |
|---|---------|--------|
| 1 | A holds the send button in a chat | The "Share location" popup with a map of A's position (Android asks for permission the first time) |
| 2 | A taps "Send your current location" | A "Location" bubble appears. B taps it and sees a map with a pin |
| 3 | A holds send, picks 15 min | A "Live location" bubble and the "Sharing" bar. SYPH offers background sharing: choose Continue and pick **Allow all the time** |
| 4 | B opens the bubble | A map with A's dot and "Live · 15 min left". A notification "SYPH is sharing your live location" shows on A |
| 5 | A walks about 50 m | The dot moves on B's map within 10-20 seconds |
| 6 | A presses Home, locks the screen and walks for 4 minutes | The dot **keeps moving** on B's map (this is the background test) |
| 7 | A swipes SYPH away from recents, walks a little | Report whether it keeps updating. It depends on the phone brand |
| 8 | A taps Stop | The bubble says "Live location ended" for both and the notification disappears |
| 9 | A says no to "Allow all the time" and repeats | Sharing works only while SYPH is open, with "Last updated" on B's side while it is not |

### 1.12 Update button (Me tab)

The **App update** card sits in the Me tab, just under the sign-in email. It shows the installed version, which stays 7.5.5 for every APK: new APKs are told apart by a hidden build number instead (below). The button is grey until an update exists; then it turns active:

| Kind | When | What the button does |
|------|------|----------------------|
| **OTA update** | You changed only JavaScript, screens, text or images | "Update now": downloads in the app, then SYPH restarts. No reinstall |
| **New APK** | You added or changed a native library or permission, or want a fresh install | "Download the new version": opens the download link. The person installs it over the old app |

SYPH checks for an OTA update when the Me tab opens and when the app returns to the front (at most every 5 minutes). "Check for updates" is also under the button. In Expo Go or a development build the button says updates are off. A newer APK always wins over an OTA update.

**Publishing an OTA update (JavaScript-only changes):**
```
eas update --channel preview --message "what changed"
```
Use the channel of the build people installed (`preview` for the APK from `eas build --profile preview`). An OTA update reaches every phone whose installed app has the same `version` in `app.json` (`runtimeVersion` follows `version`), and the version never changes, so **it reaches every APK built with updates**. That is why a new APK always comes first (below): install it on every phone before you publish an update that needs its native code.

**Publishing a new APK:**

| # | Do this |
|---|---------|
| 1 | Leave `version` alone (7.5.5). Nothing to edit: `eas.json` has `autoIncrement` on the preview profile, so EAS gives every APK a higher hidden build number, and the version people see stays 7.5.5 |
| 2 | `eas build --profile preview --platform android`. When it is done, copy the download link of the APK and read its build number with `eas build:version:get --platform android --profile preview` |
| 3 | Firebase Console > Firestore Database > Data > `appConfig` > `latest`: set `latestBuild` to that build number (a number, for example `3`), `apkUrl` to the link (must start with `https://`) and optionally `notes` |
| 4 | Phones on an older build now show "Download the new version" |

**Rule of thumb:** native change (new package with native code, new permission, `app.json` plugin change) = build a new APK and set `latestBuild`. Everything else = `eas update`. Install the new APK on every phone **before** you publish an update that needs it: an update that needs new native code crashes phones still on an older APK.

**First time:** this update is itself a new APK (it adds `expo-updates`). Phones on the old APK have no Update button until they install this one, once, by hand. Android also needs a higher internal build number (`versionCode`) for every APK to install over the last one; `eas.json` sets `autoIncrement` for the preview profile, so EAS does that for you and nobody sees it. This APK's number is the one to put in `latestBuild` for it, or leave `appConfig/latest` out until a second APK exists.

**Cost and limits:** EAS Update is included in the free Expo plan and a free account cannot be charged for overage. Expo does not publish exact free limits (check expo.dev/pricing). `appConfig` is one tiny Firestore document that signed-in users read and nobody can write from the app.

**Test checklist**

| # | Do this | Expect |
|---|---------|--------|
| 1 | Open Me on the new build | "Version 7.5.5" (unchanged), grey button "Up to date" |
| 2 | Run `eas update --channel preview --message test` and reopen SYPH, then open Me | The button turns active ("Update now") |
| 3 | Tap it | Downloads, SYPH restarts, and the card shows "· update xxxxxxxx" |
| 4 | Set `latestBuild` in `appConfig/latest` to `99` (a number) with a valid https link | The button shows "Download the new version" and opens the link. Set it back to this APK's build number afterwards |

### 1.13 Calls in the background (needs a new APK)

A call now keeps going when you press Home, lock the phone, or go back to the chat. While it runs there is one ongoing notification with the name, a clock and an **End call** button; tapping it returns to the call. Works for voice, video and group calls. Nothing to set up on your side except installing a new APK.

| Step | How | Cost |
|------|-----|------|
| Build a new APK | This adds native Android code (`modules/syph-call-service`, a small foreground service) and three permissions in `app.json` (`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `WAKE_LOCK`), so an OTA update cannot deliver it. `eas build --profile preview --platform android` (the version stays 7.5.5). Until the new APK is installed, the update that carries this change still works: calls just behave as before on the old APK. | Free |
| Allow notifications | Android 13+ asks once. If it is refused the call still keeps going, but the notification and its End call button are hidden. | Free |
| Nothing else | No key, no server, no rules change. | Free |

**Behaviour**
- Going back from the call screen (Android back button or the arrow at the top left) leaves the call running. A small round bubble with the call clock floats over the other screens: tap it to return, drag it out of the way (it settles against a side edge).
- Pressing Home or locking the phone keeps the call and its audio going (the service holds the microphone and keeps the processor awake, capped at 4 hours).
- Video: Android takes the camera away from an app that is not on screen, so SYPH turns your camera off when it goes to the background (the other person sees "Camera off") and turns it back on when you return, unless you had turned it off yourself. Audio carries on.
- **End call** on the notification hangs up for you (in a group call, you leave and the others carry on). The notification disappears when the call ends for any reason.
- One call at a time, as before. Starting a second call, or opening another call's screen, shows the one that is running.
- Signing out ends the call.

**Known limits**
- **Compile-checked, not run.** The service (`CallForegroundService.kt`, `CallServiceEvents.kt`) was compiled with kotlinc 2.1.0 against the Android 34 API and has no errors; the Expo wrapper `SyphCallServiceModule.kt` could not be checked, and none of it has run on a phone. Your EAS build is the real build. If it fails, copy me the Gradle error; the module is isolated in `modules/syph-call-service/` and can be removed on its own. Everything else (screens, rules for which call is shown, camera rule, notification text) is unit tested (`tests/unit/callBackground.test.ts`) and type-checks.
- Android only. iPhones would need background modes and a paid Apple developer account (not planned).
- A call cannot be started while SYPH is in the background (Android forbids starting the microphone service from there). Accepting from the notification opens SYPH first, so that works.
- Some phones (Xiaomi, Oppo, Vivo, Samsung with aggressive battery saving) stop apps anyway. If a call drops a minute after pressing Home, set SYPH's battery use to "Unrestricted" in Android settings.
- Swiping SYPH away from the recent-apps list during a call may end it or may not, depending on the phone.
- The bubble sits under pop-ups such as the GIF picker, and hides itself on the call screens.

**Test checklist (two phones, new APK on both)**

| # | Do this | Expect |
|---|---------|--------|
| 1 | Voice call, then press Home on one phone | You keep talking both ways. A notification "Voice call in progress · Tap to return" shows with a running clock and an End call button |
| 2 | Lock the screen for two minutes | Still talking, no stutter |
| 3 | Tap the notification | Back on the call screen with the clock still running |
| 4 | Press the back button on the call screen | The chat opens, the call continues, the bubble shows the clock. Tap the bubble: back on the call. Drag it: it moves and settles at an edge |
| 5 | Press Home, then End call in the notification | The call ends on both phones and the notification goes away |
| 6 | Hang up from the call screen | The notification goes away |
| 7 | Video call, press Home | The other phone shows "Camera off", the sound continues. Come back: your video returns |
| 8 | Video call, turn the camera off yourself, press Home, come back | The camera stays off |
| 9 | Group call with three phones, one presses Home for a minute | The others still hear that person; End call makes them leave only |
| 10 | During a call, open a chat and tap its call button | The running call is shown, no second call starts |
| 11 | Refuse the notification permission (Android 13+), then call and press Home | The call keeps going; no notification |
| 12 | On an Android 14 or 15 phone, start any call | No crash. If the app closes the moment a call starts, tell me the phone model and Android version |

### 1.14 Add people to a 1-to-1 call (rules change, JavaScript only)

On a connected 1-to-1 call, an **Add people** button appears under the name. Tap it, search by username, pick one or more people and tap **Start group call**. SYPH makes a small group chat with everyone (named after the usernames), ends the 1-to-1 call, and both of you move into a group call in that chat. The people you added get the normal group-call ring and push. Both people on the call can do this.

| Step | How | Cost |
|------|-----|------|
| Publish the new rules | Firebase Console > Firestore Database > Rules > paste `firestore.rules` > Publish. One clause was added: ending an answered call may carry `movedTo` (the group chat), and only a member of that chat can write it. | Free |
| Ship the app change | JavaScript only: `eas update --channel preview`. No new APK. | Free |

**Without the new rules** the feature still works, but the other person is not moved over by themselves: their 1-to-1 call ends and the group call rings them instead (accept to join).

**Behaviour**
- Limits are the group-call limits: 4 people for video, 6 for voice, so a video call can add 2 people and a voice call 4. The sheet says how many more can be added.
- There is a short gap in sound (about a second or two) while each phone opens the group call; nothing is recorded or lost.
- If the group chat cannot be saved (offline, 10 seconds), the sheet shows an error and the 1-to-1 call carries on untouched.
- If both people press Add at the same moment, the first one saved wins and both land in its group. The other group chat stays as an empty chat you can delete.
- The ongoing call notification stays up through the move, so Android does not mute the microphone for a phone in the background.
- The new group chat is a normal group: the person who pressed Add is its creator, so only they can add or remove members later.

**Test checklist (three phones, A and B on a call, C added; rules published)**

| # | Do this | Expect |
|---|---------|--------|
| 1 | A and B on a voice call. A taps Add people, searches C's username | C is listed, A and B are not |
| 2 | Pick C, tap Start group call | A and B both land on the group call screen with the call clock going; C's phone rings |
| 3 | C accepts | All three hear each other. A group chat named "a, b, c" exists on all three |
| 4 | Repeat on a video call, add two people | The limit line says 2 more, and a third pick is refused |
| 5 | Press Home on B just before A taps Start | B is still moved into the group call and keeps its notification |
| 6 | Turn mobile data off on A, then Start group call | An error shows after about 10 seconds, the 1-to-1 call is still going |
| 7 | B presses Add people too, at the same time as A | Both end up in one group call, not two |
| 8 | Do step 2 with the old rules still published | The call still becomes a group call, but B is rung instead of moved |

### 1.15 Sounds and vibration (partly JavaScript, partly a new APK)

The Me tab has a new **Sounds & vibration** card: vibration on or off, touch feedback on or off, the **call ringtone** (SYPH, or your phone's own) and the **message tone** (SYPH, Pop, Drop or Silent). Picking a ringtone or tone plays it once. The choices are kept on that phone only (nothing in Firestore, no rules change).

| What you get | Ships as |
|---|---|
| An incoming call rings on the ring volume and buzzes in a pattern (two pulses, a rest, repeated) until it is answered or stops | `eas update --channel preview` (phone ringtone) |
| The caller hears the usual "tu-tu" while the other phone rings | `eas update --channel preview` |
| A new message plays a tone and buzzes while SYPH is open. In the chat you are reading it is quieter and only ticks | Buzz: update. Tone: **new APK** |
| A light tick when you send a message, one pulse when a call connects, two short ones when it ends | `eas update --channel preview` |
| The SYPH ringtone (`incallmanager_ringtone.wav`), copied into the Android app by the build (`sounds` in the `expo-notifications` entry of `app.json`) | **New APK** |
| Message tones (Pop, Drop, SYPH), played by `expo-audio` (new dependency, `~57.0.5`, no plugin entry needed) | **New APK** |

**An older APK that receives the update** keeps working: calls ring with the phone's own ringtone and new messages only buzz, and the card says so. Nothing crashes, because `expo-audio` is loaded only when its native part is in the build (`services/alertSounds.ts`).

**While SYPH is closed** nothing changed: Android plays the notification sound itself, from the **Messages** and **Calls** notification categories (Android Settings > Apps > SYPH > Notifications). A phone that rings with the full-screen call screen while SYPH is closed is the separate "calls over other apps" work.

**Sounds and licensing:** every sound is synthesised from sine waves by `scripts/generate-sounds.py` (plain Python, nothing to download, nothing to license). Change a tone, run `python3 scripts/generate-sounds.py`, and rebuild. To use your own, replace a file in `assets/sounds/` with another `.wav` of the same name.

**Needs from you:** nothing (no key, no rules). Build a new APK to get the SYPH ringtone and message tones.

**Test checklist (two phones, new APK on both; step 8 on an old APK)**

| # | Do this | Expect |
|---|---------|--------|
| 1 | Me tab > Sounds & vibration > tap each message tone | Each plays once; Silent plays nothing |
| 2 | Tap "SYPH" then "Phone ringtone" under Call ringtone | Each plays for about 3 seconds |
| 3 | B calls A while A has SYPH open | A rings and buzzes until answered; B hears the "tu-tu" |
| 4 | A switches Vibration off, B calls again | A rings, no buzz |
| 5 | B sends A a message while A is on the chat list | Tone, double buzz and the usual pop-up |
| 6 | B sends A a message while A is in that chat | A softer tone and a tick, no pop-up |
| 7 | A switches Touch feedback off, then sends a message and makes a call | No tick on send, no pulse on connect or end |
| 8 | Old APK with this update: B calls and messages | Phone ringtone for the call; messages only buzz; the card explains why |
| 9 | Put the phone on silent, B calls | No ring tone, the buzz still happens |

### 1.16 Calls over other apps (needs a new APK)

Two things, both while SYPH is **in the background but still running** (Home pressed, another app open, or the phone locked):

| What | How it looks |
|---|---|
| A ringing call opens a **full-screen call screen** over the other app or the lock screen: name, Decline and Accept. The ringtone keeps playing | A notification with Accept and Decline is posted too. With SYPH open nothing changes: the usual ring screen inside the app is used |
| A live call shows a small **floating bubble** with the call clock over whatever app you are using. Drag it, tap it to return to the call | Needs "Display over other apps". Inside SYPH the in-app bubble from 1.13 does this job |

**Needs from you**

| Step | How | Cost |
|------|-----|------|
| Build a new APK | `eas build --profile preview --platform android`. The native module gained an activity and two permissions (`USE_FULL_SCREEN_INTENT`, `SYSTEM_ALERT_WINDOW`), so this cannot ship as an update | Free tier |
| Allow "Display over other apps" | Me tab > **Calls over other apps** > Open settings > switch SYPH on. Android never lets an app switch this on by itself | Free |
| Android 14 and newer: allow full-screen call alerts | Same card, second row. Android turns this off for apps it does not count as calling apps, so check it | Free |
| Some phones (Xiaomi, Oppo, Vivo, Huawei) | Also switch on "Display pop-up windows while running in the background" in the phone's permission page for SYPH. SYPH cannot open that page for you | Free |

**What it cannot do (on purpose or by Android's rules)**
- SYPH keeps nothing running while it is idle (that needs a permanent notification and costs battery). If Android has already closed SYPH, a call arrives as the ordinary push notification, as before. Giving a closed app a full-screen call screen needs a native push handler, which is a bigger separate job.
- Without "Display over other apps": a locked phone still gets the full-screen screen (if the full-screen switch allows it), a phone in use gets a banner with Accept and Decline instead, and there is no bubble.
- Accepting from the lock screen: Android asks to unlock before showing the call.
- An older APK that receives this update behaves as before; the Me tab card says "Comes with the newest version of the app".
- The Kotlin compiles (checked against Android 34 stubs and a stand-in for the Expo module API) but has never run on a device.

**Test checklist (two phones, new APK on both)**

| # | Do this | Expect |
|---|---------|--------|
| 1 | B: Me tab > Calls over other apps | Both rows say Off. Open settings > allow > come back: the row says On |
| 2 | B presses Home. A calls B | A call screen with B's caller name opens over the home screen, ringtone plays |
| 3 | B taps Accept | SYPH opens on the call screen and the call connects |
| 4 | Repeat 2, B taps Decline | The screen goes away, A sees the call declined |
| 5 | B locks the phone. A calls B | The screen lights up over the lock screen. Accept asks to unlock, then the call connects |
| 6 | Repeat 2 while A cancels before B answers | The screen and notification disappear by themselves |
| 7 | Switch "Display over other apps" off, repeat 2 | A banner with Accept and Decline, no full-screen screen, no bubble later |
| 8 | On a live call, B opens another app | A round bubble with a running clock appears; drag it, then tap it: back in the call |
| 9 | End the call from either side | The bubble disappears |
| 10 | Force-stop SYPH on B (Android Settings > Apps > SYPH > Force stop), A calls | Only the usual push notification (the known limit above) |

### 1.17 Animated emoji (JavaScript only, nothing to set up)

An emoji-only message plays Google's animated Noto emoji, as Google Messages does. Free, no key, nothing to install. It needs the phone to be online the first time each emoji is shown (after that it is cached).

| Where it comes from | Detail |
|---------------------|--------|
| Animation files | `https://fonts.gstatic.com/s/e/notoemoji/latest/<code points>/512.webp` (GIF as the fallback), Google's font CDN |
| Which emoji have one | `https://googlefonts.github.io/noto-emoji-animation/data/api.json`, fetched once and kept for a week |
| Licence | CC BY 4.0, credited at the bottom of the Me tab. Keep that line |

**Not verified from the build environment** (it cannot reach either address), so the layout above comes from Google's published documentation and scripts. If an emoji does not animate, the app shows it big and still, so nothing breaks. To check one by hand, open this in a phone browser: `https://fonts.gstatic.com/s/e/notoemoji/latest/1f98d/512.webp` (the gorilla). It should move. If it shows an error, the address has changed and `NOTO_ANIMATION_BASE` in `src/utils/animatedEmoji.ts` is the one line to fix.

| Test | Expect |
|------|--------|
| Send only 🦍 | A big gorilla that stands up and beats its chest, looping |
| Send 😀 or ❤️ or 🔥 | The animated version of each |
| Send 😀🎉🔥 | Three smaller animated emoji in one bubble |
| Send 😀😀😀😀 (four) | Big still emoji with one bounce, no animation |
| Send 👍🏽 (skin tone) | Big still emoji with one bounce |
| Send "hi 😀" | Normal small text, no animation |
| Send 🦍 in airplane mode the first time | Big still gorilla with one bounce, then animates once back online |
| Turn on the phone's "remove animations" setting, send 🦍 | Still, no animation |
| Long-press an animated emoji | The usual message menu opens |

### 1.17.1 Long-press menu on the SYPH icon (needs a new APK)

Long-pressing the SYPH icon on the Android home screen or app drawer now opens a menu (Android "app shortcuts") with three entries, above Android's own App info:

| Entry | Opens |
|---|---|
| New chat | The Add tab: search people by username, start a chat or group |
| Chats | The chat list (also gets you out of a chat or call screen in one tap; a running call keeps going) |
| Me | Your profile and settings |

Holding an entry and dragging it out puts it on the home screen as its own icon (Android does this for every app). Signed out, every entry goes to onboarding or login like a normal launch.

**Needs from you:** build a new APK (`eas build --profile preview --platform android`). The menu is native Android resources, so an `eas update` cannot add it. No key, no Firestore rules, no billing, no new package (SDK 57's own `expo-router` handles the links).

**How it works (for whoever changes it):** `plugins/withAppShortcuts.js` is an Expo config plugin. At build time it writes `res/xml/shortcuts.xml`, the labels and the three icons (`assets/shortcuts/*.xml`, white symbol on a black disc) into the generated Android project. Each entry opens `syph://shortcut/<action>`; `src/app/shortcut/[action].tsx` waits for sign-in, then goes to the screen chosen by `utils/shortcuts.ts`. The entries are the plugin's `shortcuts` list in `app.json`: change a label or add one there, add its action to `utils/shortcuts.ts`, and rebuild. A unit test keeps the two lists in step. Android shows about four entries, so the plugin refuses more than four and labels over 10 / 25 characters.

The alternate app icons (Cyber, Monochrome, Candy, Ocean, Forest, Sunset) are separate launcher entries, and Android reads the menu from whichever one is on the home screen, so the plugin adds the menu to all of them. It must stay listed **before** `@variant-systems/expo-dynamic-app-icon` in `app.json` (Expo runs the last-listed plugin first; a test checks the order).

**Limits**
- Android 7.1 and newer only. Older phones just show no menu. iOS is not built (needs a paid Apple developer account).
- Fixed entries only: no "recent chats" in the menu (that needs native code that updates the list as chats change; possible later).
- Labels are English and the icons do not follow the theme colour.
- A few phone makers' launchers show fewer entries or none; the menu is drawn by the launcher, not by SYPH.
- Checked: the plugin's output (generated with `expo prebuild`: well-formed XML, the menu on the main activity and all six icon aliases, icons rendered), unit tests, type check. **Not run on a phone.** The one part to watch is opening an entry while a chat is already open: it should return to the tabs and show the screen (`router.dismissTo`).

**Test checklist (new APK, signed in)**

| # | Do this | Expect |
|---|---------|--------|
| 1 | Long-press the SYPH icon | Menu with New chat, Chats, Me |
| 2 | Tap New chat with SYPH closed | SYPH starts on the Add tab (no flash of another screen under the splash) |
| 3 | Tap Me with SYPH closed | Starts on the Me tab |
| 4 | Open a chat, press Home, long-press the icon, tap Chats | Chat list; Back leaves SYPH or goes to the previous tab, not into a loop |
| 5 | On a live call, press Home, long-press the icon, tap Me | Me tab; the call bubble and call keep running |
| 6 | Me tab > pick another app icon, long-press the new icon | The same menu |
| 7 | Sign out, long-press the icon, tap Me | Login (or onboarding on a fresh install), not a blank screen |
| 8 | Drag "New chat" out to the home screen, tap it | Opens the Add tab |

### 1.18 Read receipts: hollow bubble, avatar queue, "Read by" (JavaScript only, nothing to set up)

Implements the design in `DOC-20261107-WA0000`. No new rules to publish: the existing rule already lets a member change their own `readState` entry, and the read log lives inside it. No new package, so `eas update --channel preview` is enough.

| State of a message you sent | Bubble | Shown with it |
|-----------------------------|--------|---------------|
| Sending (offline or not yet confirmed) | Filled | Clock |
| Sent | Filled | One tick |
| Delivered (every member's phone has it) | Filled | Two faint ticks |
| Some of a group have seen it | Filled | Avatar queue only (up to 3, then "+N"), no ticks |
| 1-to-1: read. Group: everyone has seen it | **Hollow** (2 px accent outline, same readable text, no dashes) | Nothing |
| Server refused it (text messages) | Filled | Red alert beside it; tap for Try again or Delete |

Notes:
- The hollow bubble keeps the theme's text colour so it reads on the chat background; the fill fades out over 0.25 s when the last person sees it.
- "Read by" lists only people who have seen it, newest first, each with their username (and display name under it when set) and the time they read it. Today shows the time; earlier days add the day.
- Read times come from each person's last 20 reads (`conversations/{id}.readState.<uid>.log`: `{ at, upTo }` in milliseconds). A message older than that log, or read before this update, shows that person's latest read time instead.
- A member who joined after a message was sent counts as not having seen it until they open the chat.
- There is no setting to turn read receipts off for a person, so nobody is left out of the list.

| Test (needs a group of at least three, and a second phone for each) | Expect |
|------|--------|
| Send in a 1-to-1 chat with the other phone off | Clock, then one tick when it reaches the server |
| Other phone comes online (app open, chat closed) | Two faint ticks |
| Other person opens the chat | The bubble fades to hollow, ticks gone |
| Send in a group; phone A opens the chat | Ticks replaced by A's avatar under the bubble |
| Phone B opens the chat | A and B overlap; tap them: "Read by" lists both with times, newest first |
| Phone C opens the chat (last one) | Avatars shrink away and the bubble goes hollow |
| In "Read by": tap X, tap outside, drag down | Each closes it |
| Add a fourth reader, then a fifth | Three avatars and then "+1", "+2" |
| Have another phone remove you from a group while this phone still has the chat open, then send a text | Red alert beside the bubble (the server refuses non-members); tap it for Try again / Delete |
| Light theme (Monochrome), dark theme (Cyber) | Outline and text readable on the background in both |

## 2. Data model (Firestore)

| Path | Purpose |
|------|---------|
| `users/{uid}` | Public profile: `username`, `usernameLowercase`, `displayName` (optional), `theme`. Old `profileImageUrl` / `status` fields may still exist on accounts and are ignored |
| `users/{uid}/private/settings` | Owner-only: `mutedChats[]`, `notificationsEnabled`, `expoPushTokens[]` |
| `conversations/{id}` | `participantIds[]`, `isGroup`, `groupName`, `createdBy`, last-message summary, `groupActivity` (latest rename / removal / leave, read by the push relay), `hiddenBy[]`, `readState{uid:{deliveredAt,readAt,log[{at,upTo}]}}`, `unread{uid:n}` |
| `usernames/{lowercase name}` | Claim registry: `uid`, `createdAt`. One document per name, create-once, so two accounts cannot take the same name. Readable one at a time, never listed |
| `appConfig/latest` | Newest APK for the Update button: `latestBuild` (number), `apkUrl` (https), `notes`. Signed-in users read it, nobody writes it from the app; you edit it in the Console (1.12) |
| `pushTokens/{token}` | Which account is signed in on a device (`uid`, `platform`, `updatedAt`). A sender checks it before using a token; readable one at a time, never listed |
| `userPush/{uid}` | Copy of the push-relevant settings: `tokens[]` (newest 5), `notificationsEnabled`, `mutedChats[]`. Written only by the owner, readable one at a time by signed-in users so a sender's phone can notify them |
| `calls/{id}` | One call: `callerId`, `calleeId`, `participantIds`, `type` (audio/video), `status` (ringing, accepted, declined, cancelled, missed, ended), `offer`, `answer`, `createdAt`, `expireAt`, and `movedTo` (the group chat, when people were added and the call carried on there, 1.14) |
| `calls/{id}/media/{uid}` | That person's own media state: `cameraOff` and `muted` (booleans), `expireAt`. Members read, each writes only their own |
| `calls/{id}/candidates/{id}` | ICE candidates trickled by either side (`from`, `candidate`, `sdpMid`, `sdpMLineIndex`) |
| `conversations/{id}/messages/{id}` | `type` (`text`, `gif` or `location`; a location is a live share or a one-time pin, `location: { expiresAt: 0, pin: true, lat, lng }`; the rules refuse anything else, and old photo, voice and sticker messages stay readable), `text`, `media` (GIF link only), `location` (`{ expiresAt }`, live location only), `senderId`, `replyTo`, `forwarded`, `deletedFor[]`, `deletedForEveryone`, `createdAt` |
| `conversations/{id}.activeCall` | Groups only: the "call in progress" pointer (`id`, `type`, `startedBy`, `startedByName`, `startedAt`, `beat`). Set when a call starts, refreshed by someone in the call, removed when the last person leaves |
| `conversations/{id}/groupCalls/{callId}/peers/{uid}` | Who is in the call: `sid` (this join), `username`, `joinedAt`, `lastSeen` (heartbeat), `cameraOff`, `muted`, `expireAt`. Members read, each writes only their own |
| `conversations/{id}/groupCalls/{callId}/signals/{id}` | Handshake between two members: `kind` (offer / answer / candidate), `from`, `fromSid`, `to`, `toSid`, `sdp` or `candidate`, `createdAt`, `expireAt`. Only the addressee reads it |
| `conversations/{id}/typing/{uid}` | "I am typing" marker: `typing: true`, `at` (server time). Members read, each writes only their own, deleted when they stop |
| `conversations/{id}/locations/{messageId}` | One live location share, named after its message: `senderId`, `lat`, `lng`, `accuracy`, `active`, `updatedAt`, `expiresAt` (epoch ms), `expireAt` (for a TTL policy). Members read; only the sharer writes, and afterwards only the position and `active` can change |


1-on-1 chats use the id `<uidA>_<uidB>` (sorted), so two people can never end up with two chats.

## 3. Still outstanding

| Feature | What it needs |
|---------|---------------|
| Google sign-in (FR-01) | OAuth client IDs (Firebase Console > Authentication > Sign-in method > Google, plus Web/Android/iOS client IDs from Google Cloud), the SHA-1/SHA-256 fingerprints of your build keys, and a development build. Not built yet. |
| Phone sign-in (FR-01) | Firebase's JS SDK cannot do phone sign-in cleanly in React Native (it needs reCAPTCHA or the native Firebase SDK), and SMS may need a paid plan. Decide whether it is required before anyone builds it. Not built. |
| Live location on iOS in the background | Needs a paid Apple developer account and a separate iOS build. Android is built |
| Search across full chat history (FR-11) | In-chat search covers the messages loaded on screen. Firestore has no full-text search; searching all history needs an external service (Algolia, Typesense, Meilisearch) and a small indexing function. |

## 4. Link previews: YouTube and Shorts

**Needs from you: nothing.** No key, no billing, no Firestore rules change.

A text message with a YouTube or Shorts link gets a card under the text: thumbnail, title, channel. Tapping a card with a preview **plays the video in an in-app pop-up**, so nobody leaves SYPH. The link stays in the message text. Only the first YouTube link in a message gets a card.

| Item | Detail |
|------|--------|
| Source | YouTube's free oEmbed endpoint, called from the phone while the card is on screen. Nothing is stored in Firestore or on disk; answers are remembered in memory until the app closes. |
| Links read | `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, plus `m.youtube.com`, `/embed/` and `/live/` |
| 200 | Card with thumbnail, title, channel (badge says YouTube or Short) |
| 404 / 400 | Muted "Video unavailable" card, not tappable |
| 401 / 403 | "YouTube video: no preview, tap to open" (the video exists but cannot be previewed) |
| Offline, timeout, 5xx, 429 | "Couldn't load preview, tap to open". Never shown as "unavailable": a network problem says nothing about the video. |
| Re-check | A good answer is trusted for 6 h, "unavailable" for 1 h, an error for 30 s. A video deleted later turns into the unavailable card the next time its message is shown after that. |
| Playing | The pop-up uses YouTube's own embedded player inside a web view (free, no key). Close it with X, a tap outside, or Back (the sound stops). "Open in YouTube" is always in it. A card with no preview (401 / 403, offline) still opens YouTube itself. |
| Player limits | Some owners switch embedding off. YouTube also refuses embeds that do not identify the app (error 153), so the player page is loaded with `https://com.syph.chat` as its origin; this is **unverified on a phone**. When a video cannot play, the pop-up says why and offers "Open in YouTube". No fullscreen button (it cannot work inside a pop-up): the pop-up fills the screen width instead. |
| Privacy | The phone contacts YouTube only for messages that contain a YouTube link, the same as opening the link would. |
| Shipping | JavaScript only: no new APK and no build number to set. It needs the web view that PR #16 adds (`react-native-webview`, already in the new APK), so after #16 is merged and that APK is installed: `eas update --channel preview --message "YouTube link previews"` |

Phone test (about 3 minutes):

| # | Do | Expect |
|---|----|--------|
| 1 | Send yourself `https://youtu.be/dQw4w9WgXcQ` | Card appears under the text within a few seconds |
| 2 | Send a Shorts link (`youtube.com/shorts/...`) | Card with a "Short" badge |
| 3 | Send "watch this https://youtu.be/dQw4w9WgXcQ lol" | Text stays, card below |
| 4 | Tap the card | YouTube opens on that video |
| 5 | Long-press the card | The normal message menu (reply, delete) |
| 6 | Send `https://youtu.be/aaaaaaaaaaa` (no such video) | "Video unavailable", not tappable |
| 7 | Airplane mode, then send a new YouTube link | "Couldn't load preview, tap to open". Turn airplane mode off, wait 30 s, reopen the chat: the card loads |
| 8 | Delete a message with a card for everyone | The card goes with it |
| 9 | Tap a card that shows a preview | A pop-up opens and the video plays, with sound, inside SYPH |
| 10 | Close it with X, a tap outside, or Back | The pop-up closes and the sound stops |
| 11 | Tap "Open in YouTube" in the pop-up | YouTube opens on that video |
| 12 | Play a Short | A tall (9:16) pop-up |
| 13 | Play a video whose owner turned embedding off (many music videos) | The pop-up says the owner does not allow it, with "Open in YouTube". If it says "YouTube would not start the player here" for a normal video, tell me: that is the referrer problem |

Not built: in-app reels (SYPH has no reels feature), Instagram and other site previews (other sites need a server to read their pages; Instagram was parked), a card for every link in a message.
