# SYPH push relay

A small Node service that sends push notifications (SRS FR-10) for:

- **new messages** - to every other member of the chat, unless they muted it or switched notifications off
- **group invites** - to a member who was just added to a group

It watches Firestore with the Admin SDK and delivers through Expo's push service, which forwards to
Apple (APNs) and Google (FCM). It only reads the chat summary the app already writes with each message
(`lastMessage`, `lastMessageTime`, ...), never message bodies, and needs no extra Firestore indexes.

## Run it

```bash
cd server
npm install
cp .env.example .env      # then fill in FIREBASE_SERVICE_ACCOUNT_JSON (see below)
npm start
```

You should see `SYPH push relay started`. With wrong credentials it exits immediately with a clear message.

**Service account key:** Firebase Console > Project settings > Service accounts > *Generate new private key*.
It gives full access to your database: keep it in `server/.env` or your host's secret store, never in git
(`.gitignore` already blocks `.env` and `serviceAccount*.json`).

## Hosting

It must stay running to deliver notifications. Any always-on Node 22.9+ host works: Render, Railway, Fly.io,
a small VPS, or a spare PC for testing. Set the same variables as `.env.example` in the host's settings.
If the host wants a web port, set `PORT` and the relay answers `GET /health`.

Run **one instance only**: two instances would each send every notification.

## How delivery is decided

| Condition | Result |
|-----------|--------|
| Recipient is the sender | skipped |
| `users/{uid}/private/settings.notificationsEnabled == false` | skipped |
| Chat id is in `mutedChats` | skipped |
| Token has no `pushTokens/{token}` entry naming the recipient | not sent (a shared phone never gets the previous user's messages) |
| Token entry names a different user | removed from this user's list |
| Expo reports `DeviceNotRegistered` (ticket or receipt) | token removed |

Settings are cached for 15 seconds, so a mute or switch change takes effect within that time.

## Limits worth knowing

- Messages sent **while the relay is down** are not announced afterwards (it only watches from startup onward).
  The in-app unread badges still catch the user up.
- Keep the host clock accurate (NTP). The relay compares message times against its own start time.
- Group invites keep each group's member list in memory (fine for thousands of groups).
- Calls will need their own signalling push later (FR-06); this service is built to be extended for that.

## Tests

```bash
npm test
```

29 unit tests cover the decision logic and the Expo send/receipt handling with a fake Expo client
(no network, no Firestore). The Firestore listeners themselves are thin wiring and are not covered by
automated tests; try it with two test accounts as described below.

## Try it end to end

1. Install a development or production build of the app on a **physical device** (Expo Go cannot receive remote push).
2. Sign in, accept the notification permission, and check that `pushTokens` in Firestore has an entry for the device.
3. Sign in on a second device/account, send a message to the first, and put the first app in the background.
