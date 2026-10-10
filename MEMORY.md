# SYPH - project memory (current state)

Read this first when picking the project back up. Setup steps that need your input (console clicks, keys, servers) live in `API.md`; this file is the map and the honest status. The old step-by-step from the first debugging session is summarised in `JOURNEY.md`.

## What it is

SYPH is a React Native / Expo chat app on Firebase. Expo SDK 57, React Native 0.86, React 19.2, expo-router 57, Firebase JS SDK 11 (Auth with AsyncStorage persistence, Firestore, Storage). Always check `https://docs.expo.dev/versions/v57.0.0/` before using an Expo API (see `AGENTS.md`).

## Run it

| Goal | Command |
|------|---------|
| First time | `npm install`, copy `.env.example` to `.env` and fill the Firebase values (Console > Project settings > Your apps > Web) |
| Everyday (chat, media, themes, search) | `npx expo start -c --go` and open in Expo Go |
| Push while closed, calls | Development build (`eas build --profile development --platform android` or `npx expo run:android`), then `npx expo start -c` (dev-client mode). `expo-dev-client` is installed for this. `android/` and `ios/` are git-ignored and regenerated from `app.json` |
| Checks | `npm run typecheck`, `npm run test:unit`, `cd server && npm test` |

Do not paste Firebase credentials into docs or commit `.env`. The `EXPO_PUBLIC_*` values are client config, but keep them in `.env`.

## How it is put together

- Routing: `src/app/index.tsx` sends signed-out users to onboarding / `(auth)` and signed-in users to `(tabs)` (Chat, Me, Add). Chat screen `chat/[id]`, call screen `call/[id]`.
- Providers (order matters, in `src/app/_layout.tsx`): Auth > Theme > Toast > UserSettings > Conversations > IncomingCalls.
- `src/services/*` talk to Firebase; `src/hooks/*` hold state; `src/utils/*` hold pure logic that is unit tested (`tests/unit`).
- 1-on-1 conversation id is `<uidA>_<uidB>` (sorted). Data model is in `API.md` section 2.
- Security is the rules: `firestore.rules`, `storage.rules`. List queries must filter on the fields the rules use (for example `participantIds array-contains <uid>`).
- `server/` is the push relay (Node, Firebase Admin, Expo push). Optional; the app works without it.

## Feature status

| Feature | State |
|---------|-------|
| Username + password sign-in, onboarding, 3-tab layout, default Cyan and Black theme | Built |
| Chat core: 1-on-1 and group chats, real-time messages | Built, membership-based rules |
| Read receipts (sent / delivered / read) | Built |
| Reply, forward, delete for me / for everyone, copy | Built |
| Themes | Built |
| In-chat search, per-chat mute, global notification switch | Built (search covers loaded messages only) |
| Media: photos, video, voice notes, documents, GIFs, profile photos | Built, needs Storage enabled (API.md 1.4) |
| Push notifications while closed | Built (app + `server/` relay), needs dev build, FCM and a running relay (API.md 1.5) |
| Offline banner, queued sends (NFR-07) | Built |
| Audio and video calls (FR-06) | Built, 1-to-1 only, needs dev build and TURN (API.md 1.7) |
| Google and phone sign-in, real-email sign-in (FR-01) | **Not built** (API.md section 3) |
| Search across full history | **Not built**, needs an external search service (API.md section 3) |

## SRS coverage (audit of Oct 10, 2026)

Checked against `DOC-20261002-WA0031.pdf` by reading the code, not by running the app on a device.

| Requirement | State |
|-------------|-------|
| FR-01 sign-in by email, phone or Google | **Gap.** Username + password only (made-up `@syph.com` email) |
| FR-02 profile: name, photo, status, username | **Partial.** Photo, status and username are editable. There is no separate "name"; `displayName` is just the username |
| FR-03, FR-04 one-to-one chats, groups with add/remove members | Met |
| FR-05 text, emojis, voice, photos, video, GIFs, stickers, documents | Met. Emojis come from the phone keyboard; stickers are a built-in emoji pack, not image stickers |
| FR-06 audio and video calls | Met in code, unverified on a device |
| FR-07 delivery and read status | Met |
| FR-08 reply, forward, delete, copy | Met |
| FR-09 toasts for success, errors, updates | Met (themed) |
| FR-10 push for messages, calls, group activity | **Partial.** Messages, calls and "added to group" are pushed. Removal from a group and group renames are not |
| FR-11 search chats, contacts, messages | **Partial.** Chat list search, user search in Add, and in-chat search over loaded messages. No search across full history |
| FR-12 mute chats or disable notifications | Met |
| FR-13, FR-14, FR-15 themes, Cyan and Black default, saved to profile | Met (six themes; saved to `users/{uid}.theme`) |
| NFR-01, NFR-04, NFR-05, NFR-08 | Met by design; not measured on small devices |
| NFR-02 main chat screen in 2 s | **Not measured** |
| NFR-03 secure auth and data | Rules written but never executed (see below) |
| NFR-06 upload progress and errors as toasts | Met |
| NFR-07 usable offline | Met |
| Splash and onboarding, call screen, settings/theme screen | Met (splash is the native one from `app.json`; theme and settings live on the Me tab) |

## How much is actually verified

Checked in the build environment: TypeScript is clean, the Android bundle builds, 13 unit tests (call rules) and 41 relay tests pass.

**Not verified, please test:**
- `firestore.rules` and `tests/firestore-rules` have never been run: the emulator download is blocked where this was built. Run `cd tests/firestore-rules && npm install && npm test` once and report any failing case.
- Nothing has run on a phone. Real push delivery, WebRTC calls (react-native-webrtc 124 on React Native 0.86) and Storage uploads all need a device test.
- Conversations made by the very first build have no `participantIds` and will not show; recreate them.

## Known limits

- Calls have no native call screen (CallKit / ConnectionService): a call while the app is closed arrives as a notification.
- TURN credentials in `EXPO_PUBLIC_*` are visible inside the app. Fine for testing, replace with short-lived credentials for production.
- Run exactly one push relay instance. Messages sent while it is down are not announced later.
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
