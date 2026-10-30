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
| 1 | Merge the landing PR (it brings #7, #8, #10 and #12 onto `main`). Leave **#11** (live location) open and unmerged: it is paused. Before merging any PR, check its base says `main` | GitHub. #7 and #8 each name the PR before them as their base. If a base still names a branch that was already merged, change it to `main` on the PR page | 10 min | Free | Everything below |
| 2 | Pull `main` and run `npm install` again | Terminal, after the merges | 3 min | Free | A clean install and EAS builds |
| 3 | Publish `firestore.rules` | Firebase Console > Firestore Database > Rules > paste > Publish (1.1) | 2 min | Free | Messages, push lookup, calls, typing, group calls. Without it, most things fail quietly |
| 4 | Run the rules tests (optional) | `cd tests/firestore-rules && npm install && npm test`. Needs Java 11+ and network for the first emulator download. Tell me any failing case | 10 min | Free | Confidence in the rules |
| 5 | Store your Firebase values in EAS, once | In Command Prompt: `copy .env .env.local`, then `eas env:push development --path .env.local`, and the same for `preview` and `production`. Do this **before** you pull the PR that stops tracking `.env`: that pull deletes your local `.env` (your `.env.local` copy stays and works for local runs). EAS skips git-ignored files, so this is how builds get the values. A build with values missing now stops at its start with a clear message instead of crashing on launch. | 5 min | Free | Builds that work |
| 6 | Upload the FCM V1 key | Firebase Console > Project settings > Service accounts > Generate new private key, then `eas credentials` > Android > Google Service Account Key for FCM V1 (1.5) | 10 min | Free | Push while the app is closed |
| 7 | Build the Android app | `eas login`, then `eas build --profile preview --platform android` for an installable APK (simplest for testing), or `--profile development` for the dev client. Free plan: a monthly build limit and a queue | 15-45 min, mostly waiting | Free | Push, calls, group calls (none of them work in Expo Go), and the theme icon (#10) |
| 8 | Test on 2-3 phones | Install the APK, sign in on each, allow notifications, set battery to "Unrestricted" (Xiaomi, Oppo, Vivo, Samsung). Then the push test in 1.5, the 9-row group call checklist in 1.10 and the 8-row live location checklist in 1.11 | 30-60 min | Free | Tells me what to fix |
| 9 | Firestore TTL policies (optional) | Console > Firestore > Indexes > TTL on `expireAt` for collection groups `calls`, `candidates`, `media`, `peers`, `signals` (1.7, 1.10). Without them old call documents just stay | 5 min | Free | Tidy database |
| 10 | Giphy key (optional) | developers.giphy.com, then `EXPO_PUBLIC_GIPHY_API_KEY` in `.env` (1.2). Without it the GIF picker says "not set up". `.env` is no longer committed, but the old key is in git history: regenerate it on giphy.com if you want it private | 5 min | Free | GIFs |

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
| Live location | Paused at your request. PR #11 stays open until you restart it in a later update. When you do, the open question is background sharing: it needs the "allow all the time" permission and a permanent notification, and cannot be tested from here (1.11) |
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

`expo-dev-client` is installed (needed for the development build in 1.5 and 1.7). Because of it, a plain `npx expo start` now targets the development build; use `--go` whenever you want Expo Go. Expo Go cannot do closed-app push or calls.

**Splash screen.** The splash is your four-photo picture on black, in light and dark mode, set in the `expo-splash-screen` entry of `app.json`. `assets/images/splash-icon.png` is what the build uses: the original (`splash_icon_new.png`) shrunk and centred on a transparent square so Android 12's round splash mask does not cut its corners. To change the picture, replace `splash_icon_new.png` and make a new padded copy (the photo's half-diagonal must stay under a third of the square's width). It stays up until the signed-in state is known, for at least 0.7 s, and is removed after 8 s at the latest, so a stuck sign-in check cannot leave it on screen (`src/utils/splash.ts`). **Expo Go shows the app icon instead of the splash, and a development build does not reflect every splash setting, so judge it on an installed APK** (`eas build --profile preview --platform android`). Changing the splash needs a new build, not a reload. Nothing to set up and no cost.

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
- Push notifications for calls honour the account-wide notification switch but **not** per-chat mute.
- Leaving the call screen hangs up.

**Known limits**
- There is no native call UI (CallKit / Android ConnectionService). A call that arrives while the app is closed shows as a notification; tapping it opens the chat and, if the call is still ringing, the Accept / Decline screen appears. It will not ring like the phone app while the device is locked.
- No "missed call" line in the chat history yet.
- Muted: when the other person mutes their microphone, a small muted-microphone icon appears. In a video call it sits at the bottom-left over their video; if their camera is off, or it is a voice call, it sits on their profile circle instead. It travels in the same per-person document as the camera state (`calls/{id}/media/{uid}`), so it needs the same rules from 1.1. Your own mute is shown by the highlighted Mute button.
- Camera off: when someone turns their camera off in a video call, both screens stop showing the video. The other person sees an opaque screen with that person's username and "Camera off", and the person sees their own small preview replaced by an opaque tile with their username. The camera state travels as one tiny document per person (`calls/{id}/media/{uid}`), so it needs the rules from 1.1.
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
- Audio keeps playing with the screen off but, as with 1-to-1 calls, Android may stop the microphone if the app is in the background for long.
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

### 1.11 Live location

The location button sits left of the GIF button in any chat (it replaced the sticker button). Tap it, pick 15 minutes, 1 hour or 8 hours, and allow location when Android asks. A "Live location" bubble appears in the chat and a bar "Sharing your live location · Stop" shows under the header. Anyone in the chat taps the bubble to open a map with a moving dot, a "Live · 12 min left" line, **Open in Maps** and **Recenter**. A share ends by itself, when you tap Stop, or when you sign out.

| Step | How | Cost |
|------|-----|------|
| Re-publish `firestore.rules` | Adds `conversations/{id}/locations` and the `location` message type (same as 1.1). Without it, starting a share fails with "Could not start sharing" | Free |
| New build | Adds `expo-location` and `react-native-webview`, so build again (`eas build --profile preview --platform android`). Both are also in Expo Go, so the open-app version may run there too (not tried) | Free |
| Allow location | Each person who shares allows it once ("while using the app" is enough). Viewers need no permission | Free |
| Map | OpenStreetMap tiles shown with Leaflet 1.9.4 (loaded from unpkg, with an integrity check). **No API key, no billing.** The map and the Leaflet files need internet; without it the map says so and **Open in Maps** still works | Free |
| Optional cleanup | Location documents carry `expireAt` (end of share plus 24 h). Add a TTL policy on `expireAt` for collection group `locations` (same place as 1.7). Without it they stay (tiny) | Free |

**Firestore use (free daily quota is 20,000 writes and 50,000 reads):** the sharer's phone writes a position at most every 8 seconds, and only if it moved 10 m or after a 60-second heartbeat. Walking or driving non-stop is about 450 writes an hour (3,600 for a full 8 hours); standing still is about 60 an hour. Each person with the map open reads each update once.

**Known limits**
- **Updates only run while SYPH is open on the sharer's phone.** If it goes to the background, the screen locks or the app is closed, the dot stops moving and, after 3 minutes, viewers see "Last updated ... ago". Coming back to the app resumes it. Sharing in the background needs the "allow all the time" permission and a permanent notification on the sharer's phone, and I cannot test it here, so it is not built. Say if you want it.
- OpenStreetMap's public tile server is meant for light use (friends and family is fine). If SYPH ever grows, change `TILE_URL` in `src/utils/mapHtml.ts` to a provider with a free tier.
- One share per chat at a time. A location message cannot be forwarded. Anyone in the chat can see it, including everyone in a group, until it ends.
- The first position is read before the message is sent, so tapping a duration takes a few seconds ("Finding your location...").
- Only the sharer can end a share early. A share is also stopped on sign-out, but not if the app is killed first: it then simply expires.
- Not verified on a phone: the rules tests for locations are written but have not been run, and the unit tests cover the sharing logic and the map page, not the screen.

**Test checklist (two phones, new build)**

| # | Do this | Expect |
|---|---------|--------|
| 1 | A taps the location button in a 1-to-1 chat, picks 15 minutes | Android asks for location. A "Live location" bubble and the "Sharing" bar appear. B gets a notification saying "Live location" |
| 2 | B taps the bubble | A map with a blue dot at A's position and "Live · 15 min left" |
| 3 | A walks about 50 m with SYPH open | The dot moves on B's map within 10 seconds |
| 4 | A presses Home for 4 minutes | B's status changes to "Last updated 4 min ago" |
| 5 | A returns to SYPH | The dot catches up and the status says Live again |
| 6 | A taps Stop (bar or sheet) | The bubble says "Live location ended" for both. B's map says "Sharing ended" |
| 7 | Repeat in a group | Everyone in the group can open the map |
| 8 | Turn Wi-Fi and data off on B, open the map | "The map could not load (no internet?)" and Open in Maps is the fallback |

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
| `calls/{id}/media/{uid}` | That person's own media state: `cameraOff` and `muted` (booleans), `expireAt`. Members read, each writes only their own |
| `calls/{id}/candidates/{id}` | ICE candidates trickled by either side (`from`, `candidate`, `sdpMid`, `sdpMLineIndex`) |
| `conversations/{id}/messages/{id}` | `type` (`text`, `gif` or `location`; the rules refuse anything else, and old photo, voice and sticker messages stay readable), `text`, `media` (GIF link only), `location` (`{ expiresAt }`, live location only), `senderId`, `replyTo`, `forwarded`, `deletedFor[]`, `deletedForEveryone`, `createdAt` |
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
| Live location sharing (Phase 5) | Built in PR #11 (`claude/phase-5-location`) and paused at your request, not on `main`. Foreground sharing on a free OpenStreetMap map, no key needed. The open question when you restart it is whether to keep it going with the app closed (needs the "allow all the time" permission and a permanent notification). |
| Live location in the background (Phase 5 follow-up) | Foreground sharing is built (1.11). Keeping it going with SYPH closed needs the "allow all the time" permission and a permanent notification on the sharer's phone, and cannot be tested from the build environment. Not built until you say yes. |
| Search across full chat history (FR-11) | In-chat search covers the messages loaded on screen. Firestore has no full-text search; searching all history needs an external service (Algolia, Typesense, Meilisearch) and a small indexing function. |
