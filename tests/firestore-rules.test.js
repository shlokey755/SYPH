const fs = require('fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');

const path = require('path');
const RULES = fs.readFileSync(process.env.RULES_PATH || path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const FV = firebase.firestore.FieldValue;

let passed = 0;
let failed = 0;
async function check(name, promise, expectOk) {
  try {
    await (expectOk ? assertSucceeds(promise) : assertFails(promise));
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}  (${(e && e.message || e).toString().split('\n')[0]})`);
  }
}
const ok = (n, p) => check(n, p, true);
const no = (n, p) => check(n, p, false);

(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  const env = await initializeTestEnvironment({
    projectId: 'demo-syph',
    firestore: { rules: RULES, host, port: Number(port) },
  });

  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const carol = env.authenticatedContext('carol').firestore();
  const anon = env.unauthenticatedContext().firestore();

  const direct = (uid, other) => ({
    isGroup: false, createdBy: uid, participantIds: [uid, other],
    participant1: { uid, username: uid }, participant2: { uid: other, username: other },
    lastMessage: '', hiddenBy: [], readState: {}, unread: {}, createdAt: FV.serverTimestamp(),
  });

  console.log('\nUsers');
  await ok('anyone signed in can read a profile', carol.doc('users/alice').get());
  await no('anonymous cannot read a profile', anon.doc('users/alice').get());
  await ok('owner can write own profile', alice.doc('users/alice').set({ username: 'alice' }));
  await no('others cannot write a profile', carol.doc('users/alice').set({ username: 'hax' }));
  await ok('owner can write private settings', alice.doc('users/alice/private/settings').set({ mutedChats: [] }));
  await no('others cannot read private settings', carol.doc('users/alice/private/settings').get());
  await no('others cannot write private settings', carol.doc('users/alice/private/settings').set({ expoPushTokens: ['x'] }));

  console.log('\nDirect conversations');
  await ok('alice creates alice_bob', alice.doc('conversations/alice_bob').set(direct('alice', 'bob')));
  await no('carol cannot squat the alice_bob id', carol.doc('conversations/alice_bob').set(direct('carol', 'bob')));
  await no('carol cannot create a chat she is not in', carol.doc('conversations/x_y').set(direct('alice', 'bob')));
  await ok('existence check on a missing chat is allowed', alice.doc('conversations/alice_zed').get());
  await ok('member reads chat', bob.doc('conversations/alice_bob').get());
  await no('outsider cannot read chat', carol.doc('conversations/alice_bob').get());
  await ok('member list query filtered by own uid', bob.collection('conversations').where('participantIds', 'array-contains', 'bob').get());
  await no('unfiltered list query denied', carol.collection('conversations').get());
  await no('cannot list someone else\'s chats', carol.collection('conversations').where('participantIds', 'array-contains', 'alice').get());
  await no('cannot change members of a 1-on-1', alice.doc('conversations/alice_bob').update({ participantIds: ['alice', 'bob', 'carol'] }));

  console.log('\nMessages');
  const sendAs = (db, senderId, extra = {}, convId = 'alice_bob') => {
    const batch = db.batch();
    const msg = db.collection(`conversations/${convId}/messages`).doc();
    batch.set(msg, { type: 'text', text: 'hi', senderId, senderUsername: senderId, deletedFor: [], deletedForEveryone: false, createdAt: FV.serverTimestamp(), ...extra });
    batch.update(db.doc(`conversations/${convId}`), { lastMessage: 'hi', lastMessageTime: FV.serverTimestamp(), lastMessageSenderId: senderId, hiddenBy: [], 'unread.bob': FV.increment(1) });
    return batch.commit();
  };
  await ok('member sends (message + summary batch)', sendAs(alice, 'alice'));
  await no('outsider cannot send', sendAs(carol, 'carol'));
  await no('cannot spoof senderId', sendAs(alice, 'bob'));
  await no('cannot backdate createdAt', sendAs(alice, 'alice', { createdAt: firebase.firestore.Timestamp.fromMillis(1000) }));
  await ok('member reads messages', bob.collection('conversations/alice_bob/messages').get());
  await no('outsider cannot read messages', carol.collection('conversations/alice_bob/messages').get());

  // seed one known message through the admin bypass
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('conversations/alice_bob/messages/m1').set({
      type: 'text', text: 'hello', senderId: 'alice', senderUsername: 'alice', deletedFor: [], deletedForEveryone: false,
      createdAt: firebase.firestore.Timestamp.now(),
    });
  });
  const m1 = (db) => db.doc('conversations/alice_bob/messages/m1');
  await ok('sender deletes for everyone', m1(alice).update({ deletedForEveryone: true, text: '', media: FV.delete() }));
  await no('recipient cannot delete for everyone', m1(bob).update({ deletedForEveryone: true, text: '' }));
  await ok('recipient hides message for self', m1(bob).update({ deletedFor: FV.arrayUnion('bob') }));
  await no('cannot hide a message for someone else', m1(bob).update({ deletedFor: FV.arrayUnion('alice') }));
  await no('cannot edit message text', m1(alice).update({ text: 'edited' }));
  await no('cannot delete a message document', m1(alice).delete());

  console.log('\nReceipts and conversation updates');
  await ok('bob writes own readState', bob.doc('conversations/alice_bob').update({ 'readState.bob.readAt': FV.serverTimestamp(), 'readState.bob.deliveredAt': FV.serverTimestamp(), 'unread.bob': 0 }));
  await no('bob cannot write alice\'s readState', bob.doc('conversations/alice_bob').update({ 'readState.alice.readAt': FV.serverTimestamp() }));
  await no('outsider cannot update chat', carol.doc('conversations/alice_bob').update({ lastMessage: 'x' }));
  await ok('member hides chat for self', bob.doc('conversations/alice_bob').update({ hiddenBy: FV.arrayUnion('bob') }));
  await no('cannot change createdBy', bob.doc('conversations/alice_bob').update({ createdBy: 'bob' }));
  await no('cannot delete a conversation', alice.doc('conversations/alice_bob').delete());

  console.log('\nGroups');
  const group = {
    isGroup: true, groupName: 'G', createdBy: 'alice', participantIds: ['alice', 'bob', 'carol'],
    participants: [{ uid: 'alice' }, { uid: 'bob' }, { uid: 'carol' }], hiddenBy: [], readState: {}, unread: {}, createdAt: FV.serverTimestamp(),
  };
  await ok('creator creates group', alice.doc('conversations/g1').set(group));
  await no('non-creator cannot add a member', bob.doc('conversations/g1').update({ participantIds: ['alice', 'bob', 'carol', 'dave'] }));
  await ok('creator adds a member', alice.doc('conversations/g1').update({ participantIds: ['alice', 'bob', 'carol', 'dave'] }));
  await ok('member leaves group', carol.doc('conversations/g1').update({ participantIds: ['alice', 'bob', 'dave'] }));
  await no('member cannot remove another member', bob.doc('conversations/g1').update({ participantIds: ['bob', 'dave'] }));
  await ok('creator removes a member', alice.doc('conversations/g1').update({ participantIds: ['alice', 'bob'] }));
  await no('removed member can no longer read', carol.doc('conversations/g1').get());
  await ok('creator renames group', alice.doc('conversations/g1').update({ groupName: 'New' }));

  console.log(`\n${passed} passed, ${failed} failed`);
  await env.cleanup();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
