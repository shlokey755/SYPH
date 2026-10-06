# SYPH - APIs, keys and console steps

Everything the app needs from outside the repo. Items marked **REQUIRED** must be done for the feature
to work; the rest are optional or only needed later. Keep this file current as features are added.

## 1. Firebase (REQUIRED)

Already configured through `.env` (see `.env.example`). Needed Firebase products:

| Product | Used for | Status |
|---|---|---|
| Authentication (Email/Password) | login / register (username is mapped to `<username>@syph.com`) | enabled |
| Cloud Firestore | users, conversations, messages, receipts | enabled |
| Cloud Storage | photos, videos, voice notes, documents, profile photos | **enable in console** (see section 3) |
| Cloud Messaging / Expo push | push notifications | see section 4 |

### Deploy the security rules (REQUIRED, do this before using the new build)

The new data model reads conversations with `where('participantIds', 'array-contains', uid)`.
The old rules (any signed-in user can read every conversation) must be replaced.

1. Firebase Console -> Firestore Database -> **Rules**
2. Paste the contents of `firestore.rules` -> **Publish**
   (or `npx firebase-tools deploy --only firestore:rules` if you have the CLI logged in)

Test suite for the rules: `npm run test:rules` (needs internet to download the Firestore emulator once).

> The rules were written but **not yet executed against the emulator** by the assistant that wrote them
> (the build environment blocked the emulator download). Run `npm run test:rules` once; every line should print `ok`.

### Data model change - old test chats disappear

Conversations now carry `participantIds` and use deterministic ids (`uidA_uidB`) for 1-on-1 chats.
Conversations created by the previous build do not have these fields, so they will no longer be listed.
Start the chats again from the Add tab (they were test data). No composite Firestore index is required.

## 2. Environment variables

`.env` (copy `.env.example`). All `EXPO_PUBLIC_*` values are bundled into the app; they are client
configuration, not secrets. Access control lives in `firestore.rules` / `storage.rules`.

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY` ... `EXPO_PUBLIC_FIREBASE_APP_ID` | Firebase web config |

Restrict the Firebase API key to your app (Google Cloud Console -> APIs & Services -> Credentials) once you ship.

## 3. Firebase Storage (needed for media - added with the media feature)

New Firebase projects require the **Blaze (pay-as-you-go)** plan to create a Storage bucket. Free-tier usage
limits still apply, but a billing account must be attached. If you do not want that, media sending stays
disabled (the app shows a clear message) and text chat is unaffected.

## 4. Push notifications (added with the push feature)

Details are added in that section when the feature lands.

## 5. Calls (added with the calls feature)

Details are added in that section when the feature lands.
