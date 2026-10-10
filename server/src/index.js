/**
 * SYPH push relay.
 *
 * Watches Firestore with the Admin SDK and sends Expo push notifications:
 *   - a new message in a conversation  -> every other member (honouring mute + the notification switch)
 *   - being added to a group           -> the new member
 *   - an incoming call (calls/{id})    -> the callee (honours the notification switch, not chat mute)
 *
 * It reads only the conversation summary (lastMessage, lastMessageTime, ...) that the app already writes with
 * every message, so it needs no extra indexes and never reads message bodies.
 *
 * Run it anywhere with Node 20+ that can reach Firestore and exp.host. See server/README.md.
 */

import { createServer } from 'node:http';
import { Expo } from 'expo-server-sdk';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { createPushSender } from './expoPush.js';
import {
  addedMembers,
  allowsCallNotification,
  allowsNotification,
  buildCallPush,
  buildGroupAddedPush,
  buildMessagePush,
  createDeduper,
  recipientsOf,
  shouldAnnounceCall,
  splitTokensByOwner,
  storedTokens,
  toMillis,
} from './notify.js';

const SETTINGS_TTL_MS = 15_000; // how quickly a mute / switch change takes effect
const RECEIPT_INTERVAL_MS = 5 * 60 * 1000;
const hidePreview = process.env.PUSH_HIDE_PREVIEW === '1';

const log = {
  info: (...args) => console.log(new Date().toISOString(), ...args),
  warn: (...args) => console.warn(new Date().toISOString(), ...args),
};

// ---------- Firebase ----------

function initFirebase() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) return initializeApp({ credential: cert(JSON.parse(json)) });
  // Falls back to GOOGLE_APPLICATION_CREDENTIALS (path to a service-account file) or the host's default identity.
  return initializeApp({ credential: applicationDefault() });
}

initFirebase();
const db = getFirestore();

const settingsRef = (uid) => db.doc(`users/${uid}/private/settings`);
const registryRef = (token) => db.collection('pushTokens').doc(token);

const settingsCache = new Map(); // uid -> { at, data }

async function getSettings(uid) {
  const hit = settingsCache.get(uid);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.data;
  const snap = await settingsRef(uid).get();
  const data = snap.exists ? snap.data() : {};
  settingsCache.set(uid, { at: Date.now(), data });
  return data;
}

/** token -> uid of the account signed in on that device (only tokens that have a registry entry). */
async function getTokenOwners(tokens) {
  if (tokens.length === 0) return new Map();
  const snaps = await db.getAll(...tokens.map(registryRef));
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data().uid]));
}

async function dropFromSettings(uid, token) {
  await settingsRef(uid).set({ expoPushTokens: FieldValue.arrayRemove(token) }, { merge: true });
  settingsCache.delete(uid);
}

/** Full removal of a dead token: the user's list, plus the registry entry if it still names this user. */
async function removeToken(uid, token) {
  await dropFromSettings(uid, token);
  const reg = await registryRef(token).get();
  if (reg.exists && reg.data().uid === uid) await registryRef(token).delete();
}

// ---------- Sending ----------

const expo = new Expo(process.env.EXPO_ACCESS_TOKEN ? { accessToken: process.env.EXPO_ACCESS_TOKEN } : {});
const sender = createPushSender({ expo, removeToken, log });

/**
 * @param {string[]} uids
 * @param {string} conversationId  only used for logging and for the default mute check
 * @param {(tokens: string[]) => object[]} build  turns a user's verified tokens into push messages
 * @param {(settings: object) => boolean} [allow]  per-user permission check; defaults to the chat mute + switch
 */
async function notifyUsers(uids, conversationId, build, allow = (settings) => allowsNotification(settings, conversationId)) {
  const perUser = await Promise.all(
    uids.map(async (uid) => {
      // One user's failed lookup must not cancel everyone else's notification.
      try {
        const settings = await getSettings(uid);
        if (!allow(settings)) return [];

        const tokens = storedTokens(settings);
        if (tokens.length === 0) return [];

        const { send, stale } = splitTokensByOwner(uid, tokens, await getTokenOwners(tokens));
        for (const token of stale) await dropFromSettings(uid, token); // device now belongs to another account
        return build(send).map((message) => ({ uid, message }));
      } catch (error) {
        log.warn(`could not prepare push for user ${uid}`, error);
        return [];
      }
    })
  );

  const entries = perUser.flat();
  if (entries.length > 0) {
    const result = await sender.send(entries);
    log.info(`push ${conversationId}: sent ${result.sent}, failed ${result.failed}`);
  }
}

// Fail fast with a clear message if the credentials are wrong, instead of retrying forever in the background.
try {
  await db.collection('conversations').limit(1).get();
} catch (error) {
  log.warn(
    'Cannot read Firestore. Check FIREBASE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS and that the ' +
      'service account belongs to this Firebase project.\n',
    error.message
  );
  process.exit(1);
}

// ---------- Listeners ----------

/** Subscribes and transparently re-subscribes (with backoff) if the stream is terminated by an error. */
function listen(name, makeQuery, handler) {
  let failures = 0;
  const start = () => {
    makeQuery().onSnapshot(
      (snapshot) => {
        failures = 0;
        handler(snapshot).catch((error) => log.warn(`${name}: handler failed`, error));
      },
      (error) => {
        failures++;
        const wait = Math.min(60_000, 2_000 * 2 ** failures);
        log.warn(`${name}: listener error, retrying in ${wait / 1000}s`, error.message);
        setTimeout(start, wait);
      }
    );
  };
  start();
}

const startedAt = Timestamp.now();
const messageDeduper = createDeduper();

// New messages: only conversations whose latest message is newer than when we started.
// A single-field range query, so Firestore's automatic indexes are enough.
listen(
  'messages',
  () => db.collection('conversations').where('lastMessageTime', '>', startedAt),
  async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      if (change.type === 'removed') continue;
      const conversation = change.doc.data();
      // Read receipts and unread counters also modify this document; the deduper ignores those.
      if (!messageDeduper.isNew(change.doc.id, toMillis(conversation.lastMessageTime))) continue;

      await notifyUsers(recipientsOf(conversation), change.doc.id, (tokens) =>
        buildMessagePush({ conversationId: change.doc.id, conversation, tokens, hidePreview })
      );
    }
  }
);

// Group invites: remember each group's members, notify when someone is added.
const groupMembers = new Map(); // conversationId -> uid[]
let groupsBootstrapped = false;

listen(
  'groups',
  () => db.collection('conversations').where('isGroup', '==', true),
  async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      const id = change.doc.id;
      if (change.type === 'removed') {
        groupMembers.delete(id);
        continue;
      }
      const conversation = change.doc.data();
      const members = conversation.participantIds ?? [];
      const known = groupMembers.get(id);
      groupMembers.set(id, members);

      if (!groupsBootstrapped) continue; // very first load: just learn the current members

      // Unknown group = created while we were watching; only the creator already knows about it.
      const added =
        known === undefined ? members.filter((uid) => uid !== conversation.createdBy) : addedMembers(known, members);
      if (added.length === 0) continue;

      await notifyUsers(added, id, (tokens) =>
        buildGroupAddedPush({ conversationId: id, conversation, tokens })
      );
    }
    groupsBootstrapped = true;
  }
);

// Incoming calls. A single-field range query keeps Firestore's automatic indexes enough (adding status == 'ringing'
// would need a composite index), so the status is checked in the handler instead.
const seenCalls = new Set();
listen(
  'calls',
  () => db.collection('calls').where('createdAt', '>', startedAt),
  async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      if (change.type !== 'added') continue;
      const call = change.doc.data();
      const announce = shouldAnnounceCall(call, change.doc.id, {
        startedAtMs: startedAt.toMillis(),
        nowMs: Date.now(),
        seenIds: seenCalls,
      });
      if (!announce || !call.calleeId) continue;

      await notifyUsers(
        [call.calleeId],
        call.conversationId ?? change.doc.id,
        (tokens) => buildCallPush({ callId: change.doc.id, call, tokens }),
        allowsCallNotification
      );
    }
  }
);

setInterval(() => {
  sender.checkReceipts().catch((error) => log.warn('receipt check failed', error));
}, RECEIPT_INTERVAL_MS);

// Optional health endpoint: many hosts (Render, Railway, Fly) expect a process to listen on $PORT.
if (process.env.PORT) {
  createServer((req, res) => {
    res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type': 'text/plain' });
    res.end(req.url === '/health' ? 'ok' : 'not found');
  }).listen(Number(process.env.PORT), () => log.info(`health endpoint on :${process.env.PORT}/health`));
}

log.info(`SYPH push relay started (watching messages after ${startedAt.toDate().toISOString()})`);
