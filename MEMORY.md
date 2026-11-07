# SYPH - project memory (current state)

Read this first when picking the project back up. Setup steps that need your input (console clicks, keys, servers) live in `API.md`; this file is the map and the honest status. The old step-by-step from the first debugging session is summarised in `JOURNEY.md`.

## What it is

SYPH is a React Native / Expo chat app on Firebase. Expo SDK 57, React Native 0.86, React 19.2, expo-router 57, Firebase JS SDK 11 (Auth with AsyncStorage persistence, Firestore; no Storage, nothing is uploaded). Hobby project: **nothing may cost money** (no Storage, no paid hosting, no TURN). Always check `https://docs.expo.dev/versions/v57.0.0/` before using an Expo API (see `AGENTS.md`).

## Run it

| Goal | Command |
|------|---------|
| First time | `npm install`, copy `.env.example` to `.env.local` and fill the Firebase values (Console > Project settings > Your apps > Web) |
| Everyday (chat, GIFs, themes, search, typing) | `npx expo start -c --go` and open in Expo Go |
| Push while closed, calls, group calls | Android build, not Expo Go: `eas build --profile preview --platform android` (APK) or `--profile development` (dev client, then `npx expo start -c`). EAS skips git-ignored files, so the `EXPO_PUBLIC_*` values for builds come from EAS environment variables (`eas env:push <environment> --path .env.local`, API.md 1.2); local runs read `.env.local`. A build with values missing stops at its start (`scripts/check-eas-env.cjs`). `android/` and `ios/` are git-ignored and regenerated from `app.json` |
| Checks | `npm run typecheck`, `npm run test:unit`, `cd server && npm test` |

Do not paste Firebase credentials into docs or commit `.env`. The `EXPO_PUBLIC_*` values are client config, but keep them in `.env`.

## How it is put together

- Routing: `src/app/index.tsx` sends signed-out users to onboarding / `(auth)` and signed-in users to `(tabs)` (Chat, Me, Add). Chat screen `chat/[id]`, call screen `call/[id]`.
- Providers (order matters, in `src/app/_layout.tsx`): Auth > Theme > Toast > UserSettings > Conversations > IncomingCalls > ActiveCall (runs the current call above every screen, so it outlives them).
- `src/services/*` talk to Firebase; `src/hooks/*` hold state; `src/utils/*` hold pure logic that is unit tested (`tests/unit`).
- 1-on-1 conversation id is `<uidA>_<uidB>` (sorted). Data model is in `API.md` section 2.
- Security is the rules: `firestore.rules` (`storage.rules` is a leftover, the app no longer uses Storage). List queries must filter on the fields the rules use (for example `participantIds array-contains <uid>`).
- Startup: the signed-in profile is cached on the device (`services/profileCache.ts`) so the app opens straight into the chat list, and the server copy is fetched right after. The cache is cleared at sign-out. Message objects are kept stable between snapshots (`utils/messages.ts`) so a new message does not re-render every bubble.
- Splash: native splash (the white SYPH wordmark, `splash-icon.png`, on black, from `app.json`; it replaced the owner's four-photo picture) is held by `services/splashService.ts` and released by `hooks/useSplashGate.ts` once sign-in state is known, after at least 0.7 s and at most 8 s (`utils/splash.ts`). Expo Go shows the app icon instead, so test it on an installed build.
- CI: `.github/workflows/ci.yml` runs typecheck, unit tests, an Android bundle and the relay tests on every PR. Run the same checks locally with `npm run typecheck`, `npm run test:unit`, `cd server && npm test`.
- Startup hand-off: the splash is released only when sign-in state, the saved theme (`useTheme().isReady`), the Ionicons font and the first real screen (`index.tsx` calls `services/startupRoute.ts` after it navigates; a link or notification that opens another screen skips that wait) are all done, plus 0.15 s (`utils/splash.ts`). `hooks/useSplashGate.ts` collects all of these; `components/StartupStack.tsx` (the root stack) turns screen animations off until the splash is hidden. `app.json` `backgroundColor` is black (native, needs a build).
- `server/` is the push relay (Node, Firebase Admin, Expo push). Optional; the app works without it.

## Phases (set by the owner, Oct 2026)

| Phase | What | State |
|-------|------|-------|
| 1 | Push while the app is closed (messages, calls), sent from the sender's phone | Merged, untested on a phone |
| 2 | Removed uploads, voice notes, camera upload, status, profile pictures | Merged |
| 2.5 | Typing indicator | Merged |
| 3 | Group voice and video calls (mesh WebRTC, 4 video / 6 voice) | PR #7 open, untested on phones |
| 4 | `API.md` report: what happened, what is needed from the owner | PR #8 open |
| 5 | Live location sharing, now opened by holding the send button, with background sharing | This update's PR (Oct 31) |
| 6 | Update button in the Me tab (OTA + new APK link) | This update's PR (Oct 31) |

Extras done on the way: speaker toggle, camera-off panel with username, muted icon, stickers removed (PR #6), app icon follows the theme (PR #10), splash held until the app is ready (PR #12), install and build fix (PR #9). Merge order: #9, #6, #7, #8, then #10 and #12. PR #11 stays unmerged.

## Feature status

| Feature | State |
|---------|-------|
| Username or email sign-in, password reset, optional display name, onboarding, 3-tab layout, default Cyan and Black theme | Built |
| Chat core: 1-on-1 and group chats, real-time messages | Built, membership-based rules |
| Read receipts (sent / delivered / read) | Built: see "Message ticks and hollow bubble" below |
| Reply, forward, delete for me / for everyone, copy | Built |
| Themes | Built |
| In-chat search, per-chat mute, global notification switch | Built (search covers loaded messages only) |
| Media: GIFs only (photos, video, voice, documents, stickers, profile photos and status were removed on purpose) | Built, needs a free Giphy key for the picker (API.md 1.2, 1.4) |
| Faster GIF picker | Built: trending and its first 8 pictures are loaded when a chat opens (at most every 10 minutes), searches are remembered for 10 minutes, the grid and the sent message use Giphy's 200 px wide WebP (GIF if there is no WebP), and a still of the first frame shows while the animation downloads. The sent GIF is the exact file the picker showed, so the bubble is already cached. JavaScript only (`services/gifService.ts`, `utils/gifs.ts`, `components/chat/GifPicker.tsx`) |
| Link previews: YouTube and Shorts cards that play in an in-app pop-up (web view), free oEmbed, "Video unavailable" state for dead links | Built (JavaScript only, no key needed, API.md section 4) |
| Push notifications while closed | Built: the sender's phone sends it, no server. Needs an Android build, an FCM V1 key and the rules (API.md 1.5). The `server/` relay is optional and unused |
| Typing indicator | Built (API.md 1.9) |
| Offline banner, queued sends (NFR-07) | Built |
| Day labels in chats | Built: messages are grouped by day. A small squared-off day chip (not a pill; capitals like the Me tab section titles: "TODAY", "YESTERDAY", then "SATURDAY, 31 OCT", year added when not this year) sits above the first message of each day, and the same chip floats at the top of the list while you scroll, naming the day on screen, then fades. JavaScript only, so it ships as an update (`utils/dateLabels.ts`, `components/chat/DateSeparator.tsx`, `app/chat/[id].tsx`) |
| Message ticks and hollow bubble | Built (the owner's design, `DOC-20261107-WA0000`): your bubble is filled in the theme accent with a clock while sending, one tick when sent, two ticks when delivered. In a 1-to-1 chat it turns **hollow** (2 px accent outline, fill fades out over 0.25 s, ticks go) once the other person has read it. In a group, while only some have seen it the ticks are replaced by an avatar queue under the bubble (up to 3 overlapping avatars then "+N", no text); tap it for the "Read by" sheet (avatar, username, time read, newest first, sender excluded; close with X, tap outside or drag down). When everyone has seen it the queue fades away and the bubble goes hollow. A text message the server refuses stays on screen with a red alert beside the bubble; tap for Try again / Delete. Each person's last 20 reads are kept in `readState.<uid>.log` so a message's read time is when it was seen, not their latest read (older messages fall back to the latest read). Replaces the earlier "18% darker when read" look. JavaScript only; the existing Firestore rules already allow it (`utils/receipts.ts`, `components/chat/MessageBubble.tsx`, `ReadersQueue.tsx`, `ReadBySheet.tsx`) |
| Swipe right to reply | Built: swipe any message to the right (past about 64 px) and let go to reply to it, the same as "Reply" in the long-press menu; a reply arrow fades in behind the message as it moves. Scrolling, tapping and long-press are unchanged. React Native's own PanResponder, no new package. JavaScript only (`hooks/useSwipeToReply.ts`, `utils/swipeReply.ts`) |
| Animated emoji | Built: a message that is only emoji (1 to 8, spaces allowed, no other text) is shown big. Up to three emoji play Google's animated Noto emoji (a gorilla stands up and beats its chest, a heart pulses), loaded free from Google's font CDN, cached on the phone, looping while on screen; the list of emoji that have an animation is fetched once from GitHub Pages and kept a week. Emoji without an animation (and skin tones, and 4 to 8 emoji) are shown big and still with one bounce; tap to bounce again. Still when the phone has reduce motion on. CC BY 4.0, credited at the bottom of the Me tab. JavaScript only, no new package. Not checked against the live CDN from the build environment (API.md 1.17; `utils/animatedEmoji.ts`, `services/animatedEmojiList.ts`, `components/chat/AnimatedEmoji.tsx`) |
| Search grouped by day | Built: when you search inside a chat, the matching messages are grouped by day with the same day chips as the full chat (and the floating day chip while scrolling). `utils/messages.ts` `searchMessages` |
| Audio and video calls (FR-06) | Built, 1-to-1, audio button that steps through Bluetooth earphones, wired headset, speaker and earpiece (needs the new APK for Bluetooth, API.md 1.7), camera-off panel, muted icon. Needs a dev build or APK. No TURN, so some networks cannot connect (API.md 1.7) |
| Missed-call alerts (1-to-1) | Built: the caller's phone sends a "Missed voice/video call" push when a ring ends unanswered; an open app shows an alert. Not for group calls (API.md 1.7) |
| Group voice and video calls | Built (PR #7), mesh of up to 4 video / 6 voice, Join bar, ring and push. Untested on phones (API.md 1.10) |
| Add people to a call | Built (JavaScript, needs the new rules published): "Add people" on a 1-to-1 call, search by username, becomes a group call in a new group chat; the other person follows by itself. Limits 4 video / 6 voice. Untested on phones (API.md 1.14) |
| Calls in the background | Built, needs a new APK: calls survive Home, lock and going back; ongoing notification with End call (Android foreground service, `modules/syph-call-service`, Kotlin compile-checked but never run), floating return bubble, camera off while backgrounded. Voice, video and group. Untested on phones (API.md 1.13) |
| Sounds and vibration | Built: Me tab card (vibration, touch feedback, call ringtone SYPH or phone, message tone SYPH / Pop / Drop / Silent). Incoming calls ring with a buzz pattern, the caller hears ringback, messages play a tone and buzz while the app is open. The phone ringtone, buzzes and ringback are JavaScript only; the SYPH ringtone and message tones need a new APK (`expo-audio`, `sounds` in `app.json`) and an older APK falls back to the phone ringtone and buzz-only. Closed-app alerts unchanged. Untested on phones (API.md 1.15, `utils/alertPrefs.ts`, `services/alertSounds.ts`, `scripts/generate-sounds.py`) |
| Calls over other apps | Built, needs a new APK: a ringing call opens a full-screen call screen (and a notification with Accept / Decline) over other apps and the lock screen, and a live call shows a draggable floating bubble with the clock, both only while SYPH runs in the background. Needs "Display over other apps" (Me tab card opens the setting) and, on Android 14+, full-screen call alerts. A closed app still gets only the push notification. Kotlin compile-checked (stubs), never run (API.md 1.16, `modules/syph-call-service`, `services/callOverlay.ts`, `utils/callOverlay.ts`) |
| Live location | Built: hold the send button for a Google Maps style popup, send a one-time pin or share live for 15 min / 1 h / 8 h. Background sharing with a foreground-service notification and "allow all the time". Map is Leaflet on OpenStreetMap, no key. Untested on phones (API.md 1.11) |
| Update button | Built: Me tab card, OTA through EAS Update, or a link to a new APK read from `appConfig/latest`. Needs the new APK once (API.md 1.12) |
| Google and phone sign-in (FR-01) | **Not built** (API.md section 3) |
| Search across full history | **Not built**, needs an external search service (API.md section 3) |

## SRS coverage (audit of Oct 10, 2026)

Checked against `DOC-20261002-WA0031.pdf` by reading the code, not by running the app on a device.

| Requirement | State |
|-------------|-------|
| FR-01 sign-in by email, phone or Google | **Partial.** Email sign-in, sign-up with email, password reset and verification are built (username-only accounts still work). Google and phone sign-in are not built |
| FR-02 profile: name, photo, status, username | Name and username met (optional display name shown in chat lists, headers and search). Photo and status were removed on purpose (no file storage) |
| FR-03, FR-04 one-to-one chats, groups with add/remove members | Met |
| FR-05 text, emojis, voice, photos, video, GIFs, stickers, documents | Text, emojis (phone keyboard) and GIFs are built. Voice notes, photos, video and documents were removed on purpose (no file storage). Stickers were removed too: they were only bigger emoji |
| FR-06 audio and video calls | Met in code, unverified on a device |
| FR-07 delivery and read status | Met |
| FR-08 reply, forward, delete, copy | Met |
| FR-09 toasts for success, errors, updates | Met (themed) |
| FR-10 push for messages, calls, group activity | Met in code: messages, calls, added / removed / renamed / left (relay must be redeployed) |
| FR-11 search chats, contacts, messages | **Partial.** Chat list search, user search in Add, and in-chat search over loaded messages. No search across full history |
| FR-12 mute chats or disable notifications | Met |
| FR-13, FR-14, FR-15 themes, Cyan and Black default, saved to profile | Met (six themes; saved to `users/{uid}.theme`) |
| NFR-01, NFR-04, NFR-05, NFR-08 | Met by design; not measured on small devices |
| NFR-02 main chat screen in 2 s | **Not measured.** The startup path no longer waits for the network (device-cached profile), which is the main thing in its way |
| NFR-03 secure auth and data | Rules written but never executed (see below) |
| NFR-06 upload progress and errors as toasts | Met |
| NFR-07 usable offline | Met |
| Splash and onboarding, call screen, settings/theme screen | Met (splash is the native one from `app.json`; theme and settings live on the Me tab) |

## How much is actually verified

Checked in the build environment (Oct 27, PRs #9, #6, #7, #8, #10 and #12 merged onto `main` in that order, plus #11 in a trial run, no conflicts): clean `npm ci`, TypeScript clean, 172 unit tests and 55 relay tests pass, `expo prebuild --platform android` succeeds, one copy of `expo-font`. CI is green on every PR.

**Not verified, please test:**
- `firestore.rules` and `tests/firestore-rules` have never been run: the emulator download is blocked where this was built. Run `cd tests/firestore-rules && npm install && npm test` once and report any failing case.
- Nothing has run on a phone. Real push delivery (Expo's push endpoint is blocked from the build environment), 1-to-1 and group WebRTC calls (react-native-webrtc 124 on React Native 0.86), speaker routing and the typing indicator all need a device test.
- `npm ci` on `main` fails with ERESOLVE (reanimated 4.7.1 against worklets 0.10.x), and a second copy of `expo-font` (58 beside 57) is a likely cause of the Android build failing. PR #9 fixes both. The Gradle compile itself cannot run where this was built, so the APK build is unconfirmed: if it still fails, send the failed build's "Run gradlew" log. See `API.md` 0.4.
- Conversations made by the very first build have no `participantIds` and will not show; recreate them.

## Known limits

- Calls have no native call screen (CallKit / ConnectionService): a call while the app is closed arrives as a notification. The speaker/earpiece toggle uses `react-native-incall-manager` (native, dev build only) and has not been tried on a device.
- No TURN server (the owner declined: it costs money). Calls use free STUN only, so some network pairs cannot connect. If TURN is ever added, its credentials in `EXPO_PUBLIC_*` are visible inside the app.
- Calls run in `components/call/ActiveCallHost.tsx` (state in `services/activeCallStore.ts`), not in the call screens, which only draw them. One call at a time; screens ask with `startCall` and get start / attach / busy. The Android foreground service (`modules/syph-call-service`, JS wrapper `services/callForeground.ts`) is native Kotlin that compiles (checked with kotlinc against Android 34) but has never run on a phone (API.md 1.13).
- "Add people" (`utils/callUpgrade.ts`, `components/call/AddPeopleSheet.tsx`): a 1-to-1 call ends with `movedTo` = a new group chat; both `DirectCallHost`s then `releaseCall` + `startCall` a group call in it, and the foreground service is deliberately left running between the two hosts (`movedTo` check in `useBackgroundCall`). The first phone to start the group call wins (`startOrJoinPointer`).
- Group calls are a mesh: 4 people for video, 6 for voice. Any member can clear the "call in progress" marker. No screen sharing, no host who ends the call for all.
- Push is client-sent: the sender's phone must be online, any signed-in user can read another user's device tokens one at a time, and group changes (rename, remove, leave) do not push without the optional relay.
- Android only in practice: iOS builds and push need a paid Apple developer account.
- If the optional relay is ever used, run exactly one instance and set `EXPO_PUBLIC_PUSH_MODE="relay"`.
- Web is not a supported target (no `react-native-web` dependency).
- `syph.backup/` in the repo is an old copy of some files and is not used by the app; it can be deleted when you are sure you do not need it.

## If something breaks

| Symptom | Check |
|---------|-------|
| App buffers on load or auth does nothing | `.env` present and filled, then Firestore rules published, then Expo Go SDK matches the project (SDK 57) |
| Chats missing after updating | Old conversations lack `participantIds` (see above) |
| `PlatformConstants could not be found` | A native-module import crashing in Expo Go; see `JOURNEY.md` item 7 |
| Odd errors after version changes | `npx expo start -c` to clear Metro's cache |
| Call or push does nothing | Expo Go cannot do either. Use a development build |
| Someone cannot be found when adding by username | Their `users/{uid}` document needs `usernameLowercase` (all lowercase) and `uid`. The app now repairs both the next time that person opens it (`utils/profileRepair.ts`), and search uses the document id instead of the `uid` field. Search matches the start of the username only, not display names or emails |
