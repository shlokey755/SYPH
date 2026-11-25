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

## Push gateway (so the web version can notify phones)

Phones send their own push notifications by asking Expo's push service directly. A **browser cannot**: the service sends no
CORS headers, so the browser refuses the request ("Push request failed: Failed to fetch") and nothing is delivered. The gateway
is the small server the web app posts to instead; it passes the same messages on to Expo. Phones are not affected.

- It needs **no `npm install` and no service account**, only your Firebase project id. It uses that to check that each request
  carries the sign-in token of someone signed in to *your* app, so strangers cannot use it.
- **Run it** (Node 22.9+): `cd server`, then `npm run gateway`. It reads `server/.env`, then the app's own `.env.local` and `.env`
  one folder up, so when the app's `EXPO_PUBLIC_FIREBASE_PROJECT_ID` is in either it needs nothing more. Otherwise copy
  `.env.example` to `.env` and set `FIREBASE_PROJECT_ID` to the **Project ID** from Firebase console > Project settings > General
  (not the project's name: a name such as `syph` makes it refuse every request). The window it runs in then says which settings it
  read and what address to give the app, and checks that this computer can reach Google and Expo.
- **Tell the web app where it is.** This goes in the **app's** settings (`.env` or `.env.local` in the main SYPH folder), not in
  `server/.env`: `EXPO_PUBLIC_PUSH_GATEWAY_URL="http://localhost:8787/push"`. Then restart with `npx expo start --web --clear` (the
  setting is read when the web app starts). Without it the web version sends no push notifications and says so once in the browser's
  console. If you open the web app from another device, use this computer's address instead of `localhost`.
- **Hosting:** like the relay, any always-on Node host (Render, Railway, Fly.io, a small VPS) works; set the same variables in the
  host's settings. A web page served over https can only reach an https gateway (a gateway on `localhost` only if the browser allows it: Chrome asks
  before a website talks to your own computer), and `ALLOWED_ORIGINS` can list the site's address, for example `https://your-site.web.app`.
- It limits each person to 120 requests a minute and only passes on well-formed push messages (at most 100 per request).
- Only needed while `EXPO_PUBLIC_PUSH_MODE` is `client` (the default). With `relay`, the relay above sends everything and the web
  app sends nothing.

### If phones are still not notified

The gateway's window is the place to look: it writes one line for every request the app makes, and the reason for every refusal.

1. Open `http://localhost:8787/` in the browser the web app is open in. It should say `SYPH push gateway: running` and name the
   project. If it does not open, the gateway is not running, or the window says another program has the port.
2. From the web app, send a message (or start a call) to someone whose phone has SYPH closed, and look at the window.

| The window shows | Meaning, and what to do |
|------------------|-------------------------|
| nothing at all | The web app is not sending to the gateway. `EXPO_PUBLIC_PUSH_GATEWAY_URL` is missing from the **app's** `.env` or `.env.local` (not `server/.env`), or the web app was not restarted with `--clear`, or the page is opened from another device (use this computer's address in the setting). Press F12 in the browser: the Console says `Phones are not notified of what you send from a browser` or `The push gateway ... did not answer`. A page served from the internet (https) may be stopped by the browser from reaching a gateway on your own computer (Chrome asks first, or refuses): host the gateway (above) instead. |
| `Refused: ... token is for another project` | The gateway is set to another project than the app signs in to. The line names both and says what to put in `FIREBASE_PROJECT_ID`. |
| `Refused: ... not in ALLOWED_ORIGINS` | Add the page's address to `ALLOWED_ORIGINS`, or leave it empty while testing. |
| `CHECK FAILED: cannot reach ...` | This computer cannot reach Google (`www.googleapis.com`) or Expo (`exp.host`): the connection or a firewall. |
| `sent 1 notification(s) (message). Expo accepted 1.` | The gateway did its part. Within about 20 seconds a line follows: `Google's push service took 1 notification(s) without a problem` (then look at the phone, below) or `Problem after sending: ...` with the explanation. |
| `Expo accepted 0 of 1` with `DeviceNotRegistered` | The token stored for that phone is stale (the app was removed or reinstalled). Opening SYPH on the phone and signing in registers a new one. |
| `... InvalidCredentials` or `MismatchSenderId` | Expo holds no working Google (FCM) key for the app, or one from another Firebase project: `eas credentials` (API.md 1.5). |
| nothing at all, though the setting is right and the Console is quiet | The app decided there was nobody to notify. The phone must be signed in as the **other** person (nothing is sent to the sender's own account), who must not have switched notifications off in SYPH's settings or muted that chat, and must have a phone on file: `userPush/{their user id}.tokens` in Firebase console > Firestore is empty until they open SYPH on the phone, sign in and allow notifications. |

To take the web app and the gateway out of the picture, send one notification from this computer straight to a phone:

```bash
npm run push:test -- "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"          # a message
npm run push:test -- "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" --call   # a call: a phone with the newest build rings
```

The token is in Firebase console > Firestore > `userPush` > (the phone owner's user id) > `tokens`. It says whether Expo accepted
the notification and whether Google took it. If this works but the web app does not, the fault is the gateway or the web app's
settings (the table above). If this does not work either, it is Expo's Google key or the phone.

When the notification reaches Google and the phone still shows nothing, it is the phone: SYPH must have been opened and signed in
on it once with notifications allowed (Android 13 and later ask); Android Settings > Apps > SYPH > Notifications must be on;
Xiaomi, Oppo, Vivo, Realme, OnePlus, Huawei and Samsung (sleeping apps) stop notifications for an app that was swiped away, so set
SYPH's battery use to Unrestricted and allow auto-start; "Force stop" in the app's info page stops them until SYPH is opened
again; and Do Not Disturb silences them.

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

Unit tests cover the decision logic and the Expo send/receipt handling with a fake Expo client
(no network, no Firestore), and the gateway (its sign-in check, its log, its real HTTP server, its settings files) with nothing but Node. The Firestore listeners themselves are thin wiring and are not covered by
automated tests; try it with two test accounts as described below.

## Try it end to end

1. Install a development or production build of the app on a **physical device** (Expo Go cannot receive remote push).
2. Sign in, accept the notification permission, and check that `pushTokens` in Firestore has an entry for the device.
3. Sign in on a second device/account, send a message to the first, and put the first app in the background.
