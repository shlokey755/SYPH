const fs = require('fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');

const path = require('path');
const RULES = fs.readFileSync(process.env.RULES_PATH || path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8');
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
  const updateGroupAs = (e, uid, data) => e.authenticatedContext(uid).firestore().doc('conversations/g1').update(data);

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
  await no('a new sticker is refused (removed)', sendAs(alice, 'alice', { type: 'sticker', text: '🔥' }));
  const inHours = (h) => Date.now() + h * 3600_000;
  await ok('a live location message can be sent', sendAs(alice, 'alice', { type: 'location', text: '', location: { expiresAt: inHours(1) } }));
  await no('a location message needs an end time', sendAs(alice, 'alice', { type: 'location', text: '' }));
  await no('the end time must be a number', sendAs(alice, 'alice', { type: 'location', text: '', location: { expiresAt: 'soon' } }));
  await no('a share cannot run for days', sendAs(alice, 'alice', { type: 'location', text: '', location: { expiresAt: inHours(24) } }));
  await no('a location message cannot carry extra fields', sendAs(alice, 'alice', { type: 'location', text: '', location: { expiresAt: inHours(1), admin: true } }));
  await ok('a GIF link can be sent', sendAs(alice, 'alice', { type: 'gif', text: '', media: { url: 'https://media.giphy.com/x.gif' } }));
  await no('a photo can no longer be sent', sendAs(alice, 'alice', { type: 'image', media: { url: 'https://x/y.jpg' } }));
  await no('a voice note can no longer be sent', sendAs(alice, 'alice', { type: 'audio' }));
  await no('a document can no longer be sent', sendAs(alice, 'alice', { type: 'document' }));
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

  console.log('\nLive locations');
  const msgDoc = (db, id) => db.doc(`conversations/alice_bob/messages/${id}`);
  const locMsg = (extra = {}) => ({ type: 'location', text: '', senderId: 'alice', senderUsername: 'alice', deletedFor: [], deletedForEveryone: false, createdAt: FV.serverTimestamp(), location: { expiresAt: inHours(1) }, ...extra });
  const pos = (extra = {}) => ({ senderId: 'alice', lat: 12.97, lng: 77.59, accuracy: 8, active: true, updatedAt: FV.serverTimestamp(), expiresAt: inHours(1), expireAt: firebase.firestore.Timestamp.fromMillis(inHours(25)), ...extra });
  const locDoc = (db, id) => db.doc(`conversations/alice_bob/locations/${id}`);
  await ok('sharer creates the location document', locDoc(alice, 's1').set(pos()));
  await no('an outsider cannot create one', locDoc(carol, 's2').set(pos({ senderId: 'carol' })));
  await no('cannot create one in someone else\'s name', locDoc(bob, 's3').set(pos({ senderId: 'alice' })));
  await no('latitude must be real', locDoc(alice, 's4').set(pos({ lat: 95 })));
  await no('longitude must be real', locDoc(alice, 's5').set(pos({ lng: 200 })));
  await no('a share cannot run for days (document)', locDoc(alice, 's6').set(pos({ expiresAt: inHours(24) })));
  await no('must start active', locDoc(alice, 's7').set(pos({ active: false })));
  await no('unexpected fields are refused (location doc)', locDoc(alice, 's8').set(pos({ admin: true })));
  await ok('accuracy may be unknown', locDoc(alice, 's9').set(pos({ accuracy: null })));
  await ok('the other member reads it', locDoc(bob, 's1').get());
  await no('an outsider cannot read it', locDoc(carol, 's1').get());
  await ok('sharer moves the position', locDoc(alice, 's1').update({ lat: 12.98, lng: 77.6, accuracy: 5, updatedAt: FV.serverTimestamp() }));
  await no('the other member cannot move it', locDoc(bob, 's1').update({ lat: 1, lng: 1, accuracy: 5, updatedAt: FV.serverTimestamp() }));
  await no('the end time cannot be changed afterwards', locDoc(alice, 's1').update({ expiresAt: inHours(8) }));
  await no('the owner cannot be changed', locDoc(alice, 's1').update({ senderId: 'bob' }));
  await no('an out-of-range update is refused', locDoc(alice, 's1').update({ lat: 120, lng: 1, accuracy: 5, updatedAt: FV.serverTimestamp() }));
  await ok('sharer stops sharing', locDoc(alice, 's1').update({ active: false, updatedAt: FV.serverTimestamp() }));
  await no('a location document cannot be deleted', locDoc(alice, 's1').delete());

  await ok('sharer posts a location message with a known id', msgDoc(alice, 'loc1').set(locMsg()));
  await ok('sharer ends it early (end time moves earlier)', msgDoc(alice, 'loc1').update({ location: { expiresAt: Date.now() } }));
  await no('nobody can extend the end time', msgDoc(alice, 'loc1').update({ location: { expiresAt: inHours(5) } }));
  await no('the other member cannot end it', msgDoc(bob, 'loc1').update({ location: { expiresAt: 1 } }));
  await ok('sharer deletes the message for everyone', msgDoc(alice, 'loc1').update({ deletedForEveryone: true, text: '', media: FV.delete(), location: FV.delete() }));
  const txtMsg = { type: 'text', text: 'hi', senderId: 'alice', senderUsername: 'alice', deletedFor: [], deletedForEveryone: false, createdAt: FV.serverTimestamp() };
  await msgDoc(alice, 'txt1').set(txtMsg);
  await ok('a text message can still be deleted for everyone', msgDoc(alice, 'txt1').update({ deletedForEveryone: true, text: '', media: FV.delete(), location: FV.delete() }));
  await no('a text message cannot grow a location', msgDoc(alice, 'txt1').update({ location: { expiresAt: 1 } }));

  console.log('\nTyping indicator');
  const marker = (extra = {}) => ({ typing: true, at: FV.serverTimestamp(), ...extra });
  await ok('member writes own typing marker', alice.doc('conversations/alice_bob/typing/alice').set(marker()));
  await ok('member refreshes own typing marker', alice.doc('conversations/alice_bob/typing/alice').set(marker()));
  await no('cannot fake someone else typing', alice.doc('conversations/alice_bob/typing/bob').set(marker()));
  await no('outsider cannot write a typing marker', carol.doc('conversations/alice_bob/typing/carol').set(marker()));
  await no('cannot backdate the marker', alice.doc('conversations/alice_bob/typing/alice').set(marker({ at: firebase.firestore.Timestamp.fromMillis(1000) })));
  await no('typing must be true (stop = delete)', alice.doc('conversations/alice_bob/typing/alice').set(marker({ typing: false })));
  await no('unexpected fields are refused', alice.doc('conversations/alice_bob/typing/alice').set(marker({ note: 'hi' })));
  await ok('the other member can read markers', bob.collection('conversations/alice_bob/typing').get());
  await no('outsider cannot read markers', carol.collection('conversations/alice_bob/typing').get());
  await no('cannot delete someone else\'s marker', bob.doc('conversations/alice_bob/typing/alice').delete());
  await ok('member deletes own marker', alice.doc('conversations/alice_bob/typing/alice').delete());
  await ok('deleting a marker that is already gone is harmless', alice.doc('conversations/alice_bob/typing/alice').delete());

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

  console.log('\nGroup activity (read by the push relay)');
  const act = (type, by, extra = {}) => ({ type, by, byName: by, at: FV.serverTimestamp(), ...extra });
  await ok('rename can record who did it', alice.doc('conversations/g1').update({ groupName: 'Third', groupActivity: act('renamed', 'alice') }));
  await no('activity cannot name someone else as the actor', alice.doc('conversations/g1').update({ groupName: 'Fourth', groupActivity: act('renamed', 'bob') }));
  await no('activity cannot carry a made-up time', alice.doc('conversations/g1').update({
    groupName: 'Fifth', groupActivity: { type: 'renamed', by: 'alice', byName: 'alice', at: firebase.firestore.Timestamp.fromMillis(1000) },
  }));
  await no('an outsider cannot record activity', carol.doc('conversations/g1').update({ groupActivity: act('renamed', 'carol') }));
  await ok('creator adds a member again', alice.doc('conversations/g1').update({ participantIds: ['alice', 'bob', 'dave'] }));
  await ok('creator removal can be recorded', alice.doc('conversations/g1').update({
    participantIds: ['alice', 'bob'], groupActivity: act('removed', 'alice', { targets: ['dave'] }),
  }));
  await ok('creator adds a member once more', alice.doc('conversations/g1').update({ participantIds: ['alice', 'bob', 'dave'] }));
  await ok('a member leaving can be recorded', updateGroupAs(env, 'dave', { participantIds: ['alice', 'bob'], groupActivity: act('left', 'dave') }));

  console.log('\nGroup calls (pointer, presence, signals)');
  const dave = env.authenticatedContext('dave').firestore();
  const gcGroup = { ...group, groupName: 'Calls', createdBy: 'alice', participantIds: ['alice', 'bob', 'carol'] };
  await ok('setup: group for calls', alice.doc('conversations/gc1').set(gcGroup));
  const ptr = (by, extra = {}) => ({ id: 'call1', type: 'video', startedBy: by, startedByName: by, startedAt: 1000, beat: 1000, ...extra });
  await ok('a member starts the call pointer', bob.doc('conversations/gc1').update({ activeCall: ptr('bob') }));
  await ok('another member refreshes the beat', carol.doc('conversations/gc1').update({ activeCall: ptr('bob', { beat: 2000 }) }));
  await no('an outsider cannot touch the pointer', dave.doc('conversations/gc1').update({ activeCall: ptr('bob') }));
  await no('the starter must be a member', alice.doc('conversations/gc1').update({ activeCall: ptr('zed') }));
  await no('type must be audio or video', alice.doc('conversations/gc1').update({ activeCall: ptr('alice', { type: 'screen' }) }));
  await no('the pointer takes no extra fields', alice.doc('conversations/gc1').update({ activeCall: ptr('alice', { note: 'x' }) }));
  await no('beat must be a number', alice.doc('conversations/gc1').update({ activeCall: ptr('alice', { beat: 'now' }) }));
  await no('1-on-1 chats have no group call pointer', alice.doc('conversations/alice_bob').update({ activeCall: ptr('alice') }));
  await ok('a member ends the call (removes the pointer)', carol.doc('conversations/gc1').update({ activeCall: FV.delete() }));

  const peer = (uid, extra = {}) => ({
    uid, sid: 's-' + uid, username: uid, joinedAt: FV.serverTimestamp(), lastSeen: FV.serverTimestamp(),
    cameraOff: false, muted: false, expireAt: firebase.firestore.Timestamp.fromMillis(Date.now() + 86400000), ...extra,
  });
  const peerDoc = (db, uid) => db.doc('conversations/gc1/groupCalls/call1/peers/' + uid);
  await ok('a member joins the call (own presence)', peerDoc(alice, 'alice').set(peer('alice')));
  await ok('another member joins', peerDoc(bob, 'bob').set(peer('bob')));
  await no('cannot join as someone else', peerDoc(alice, 'carol').set(peer('carol')));
  await no('an outsider cannot join', peerDoc(dave, 'dave').set(peer('dave')));
  await no('the document must name its owner', peerDoc(alice, 'alice').set(peer('alice', { uid: 'bob' })));
  await no('the session id is required', peerDoc(alice, 'alice').set(peer('alice', { sid: '' })));
  await no('presence takes no extra fields', peerDoc(alice, 'alice').set(peer('alice', { admin: true })));
  await no('muted must be a boolean', peerDoc(alice, 'alice').set(peer('alice', { muted: 'yes' })));
  await no('lastSeen cannot be backdated', peerDoc(alice, 'alice').set(peer('alice', { lastSeen: firebase.firestore.Timestamp.fromMillis(1000) })));
  await ok('the heartbeat refreshes lastSeen', peerDoc(alice, 'alice').update({ lastSeen: FV.serverTimestamp() }));
  await ok('camera and mute changes are published', peerDoc(alice, 'alice').update({ cameraOff: true, muted: true, lastSeen: FV.serverTimestamp() }));
  await no('the join time cannot be moved', peerDoc(alice, 'alice').update({ joinedAt: firebase.firestore.Timestamp.fromMillis(1000), lastSeen: FV.serverTimestamp() }));
  await ok('members read who is in the call', bob.collection('conversations/gc1/groupCalls/call1/peers').get());
  await no('an outsider cannot read presence', dave.collection('conversations/gc1/groupCalls/call1/peers').get());
  await no('cannot remove someone else', peerDoc(bob, 'alice').delete());
  await ok('a member leaves (deletes own presence)', peerDoc(bob, 'bob').delete());

  const sig = (from, to, extra = {}) => ({
    kind: 'offer', from, fromSid: 's-' + from, to, toSid: 's-' + to, sdp: 'v=0', createdAt: FV.serverTimestamp(),
    expireAt: firebase.firestore.Timestamp.fromMillis(Date.now() + 86400000), ...extra,
  });
  const sigs = (db) => db.collection('conversations/gc1/groupCalls/call1/signals');
  await ok('a member sends an offer to another member', sigs(alice).add(sig('alice', 'bob')));
  await ok('an ICE candidate can be sent', sigs(bob).add(sig('bob', 'alice', { kind: 'candidate', candidate: { candidate: 'c', sdpMid: '0', sdpMLineIndex: 0 } })));
  await no('cannot send as someone else', sigs(alice).add(sig('bob', 'carol')));
  await no('cannot send to a non-member', sigs(alice).add(sig('alice', 'dave')));
  await no('an outsider cannot send', sigs(dave).add(sig('dave', 'alice')));
  await no('unknown signal kinds are refused', sigs(alice).add(sig('alice', 'bob', { kind: 'screen' })));
  await no('signals take no extra fields', sigs(alice).add(sig('alice', 'bob', { admin: true })));
  await ok('the addressee reads their signals', sigs(bob).where('to', '==', 'bob').get());
  await no('cannot read signals addressed to someone else', sigs(carol).where('to', '==', 'bob').get());
  await no('signals cannot be listed without a filter', sigs(bob).get());

  console.log('\nPush token registry');
  const tok = (uid) => ({ uid, platform: 'android', updatedAt: FV.serverTimestamp() });
  await ok('user claims a device token for themselves', alice.doc('pushTokens/ExponentPushToken[abc]').set(tok('alice')));
  await no('cannot register a token as someone else', carol.doc('pushTokens/ExponentPushToken[evil]').set(tok('alice')));
  await no('cannot add unexpected fields', alice.doc('pushTokens/ExponentPushToken[x]').set({ ...tok('alice'), admin: true }));
  await ok('a new account on the same device can take over the token', bob.doc('pushTokens/ExponentPushToken[abc]').set(tok('bob')));
  await no('previous owner cannot delete the entry after takeover', alice.doc('pushTokens/ExponentPushToken[abc]').delete());
  await ok('current owner deletes the entry', bob.doc('pushTokens/ExponentPushToken[abc]').delete());
  await ok('deleting a missing entry is harmless', alice.doc('pushTokens/ExponentPushToken[gone]').delete());
  await ok('a signed-in user can look up one token owner', alice.doc('pushTokens/ExponentPushToken[abc]').get());
  await no('anonymous cannot look up a token', anon.doc('pushTokens/ExponentPushToken[abc]').get());
  await no('registry cannot be listed', alice.collection('pushTokens').get());

  console.log('\nPush mirror (userPush)');
  const mirror = (extra = {}) => ({ tokens: ['ExponentPushToken[a]'], notificationsEnabled: true, mutedChats: [], updatedAt: FV.serverTimestamp(), ...extra });
  await ok('owner writes own mirror', alice.doc('userPush/alice').set(mirror()));
  await no('others cannot write someone else\'s mirror', carol.doc('userPush/alice').set(mirror()));
  await ok('a signed-in user can read one mirror', bob.doc('userPush/alice').get());
  await no('anonymous cannot read a mirror', anon.doc('userPush/alice').get());
  await no('mirrors cannot be listed', bob.collection('userPush').get());
  await no('more than 5 devices is refused', alice.doc('userPush/alice').set(mirror({ tokens: ['1', '2', '3', '4', '5', '6'] })));
  await no('unexpected fields are refused', alice.doc('userPush/alice').set(mirror({ admin: true })));
  await no('notificationsEnabled must be a boolean', alice.doc('userPush/alice').set(mirror({ notificationsEnabled: 'yes' })));
  await ok('owner deletes own mirror', alice.doc('userPush/alice').delete());
  await no('others cannot delete a mirror', carol.doc('userPush/alice').delete());

  console.log('\nUsername registry');
  const claim = (db, name, uid) => db.doc(`usernames/${name}`).set({ uid, createdAt: FV.serverTimestamp() });
  await ok('can claim a free username for yourself', claim(alice, 'alice_01', 'alice'));
  await no('cannot claim a name that is already taken', claim(bob, 'alice_01', 'bob'));
  await no('cannot claim a name on behalf of someone else', claim(bob, 'bobs_name', 'alice'));
  await no('cannot claim a name that is too short', claim(bob, 'ab', 'bob'));
  await no('cannot claim a name with upper-case letters', claim(bob, 'Bobby', 'bob'));
  await no('cannot claim a name ending in a dot', claim(bob, 'bobby.', 'bob'));
  await no('cannot add extra fields to a claim', bob.doc('usernames/bobby').set({ uid: 'bob', createdAt: FV.serverTimestamp(), admin: true }));
  await no('anonymous cannot claim', claim(anon, 'anon_name', 'alice'));
  await ok('signed-in users can check who owns a name', carol.doc('usernames/alice_01').get());
  await no('anonymous cannot read the registry', anon.doc('usernames/alice_01').get());
  await no('the registry cannot be listed', carol.collection('usernames').get());
  await no('the owner cannot rewrite a claim', alice.doc('usernames/alice_01').update({ uid: 'bob' }));
  await no('others cannot release your name', bob.doc('usernames/alice_01').delete());
  await ok('the owner can release their name', alice.doc('usernames/alice_01').delete());
  await ok('a released name can be claimed by someone else', claim(bob, 'alice_01', 'bob'));

  console.log('\nCalls');
  const expire = () => firebase.firestore.Timestamp.fromMillis(Date.now() + 3600 * 1000);
  const offer = { type: 'offer', sdp: 'v=0' };
  const answer = { type: 'answer', sdp: 'v=0' };
  const newCall = (caller, callee, extra = {}) => ({
    conversationId: 'alice_bob', callerId: caller, callerName: caller, calleeId: callee, calleeName: callee,
    participantIds: [caller, callee], type: 'audio', status: 'ringing', offer,
    createdAt: FV.serverTimestamp(), expireAt: expire(), ...extra,
  });
  const seedCall = (id, status = 'ringing') =>
    env.withSecurityRulesDisabled((ctx) =>
      ctx.firestore().doc(`calls/${id}`).set({ ...newCall('alice', 'bob'), status, createdAt: firebase.firestore.Timestamp.now() })
    );

  await ok('caller starts a call in their 1-on-1 chat', alice.doc('calls/new1').set(newCall('alice', 'bob')));
  await ok('video call is allowed too', alice.doc('calls/new2').set(newCall('alice', 'bob', { type: 'video' })));
  await no('cannot start a call as someone else', alice.doc('calls/x1').set(newCall('bob', 'alice')));
  await no('cannot call yourself', alice.doc('calls/x2').set(newCall('alice', 'alice')));
  await no('cannot call someone outside the chat', alice.doc('calls/x3').set(newCall('alice', 'carol', { conversationId: 'alice_bob' })));
  await no('cannot call through a group chat', alice.doc('calls/x4').set(newCall('alice', 'bob', { conversationId: 'g1' })));
  await no('cannot start a call that is already accepted', alice.doc('calls/x5').set(newCall('alice', 'bob', { status: 'accepted' })));
  await no('cannot add unexpected fields', alice.doc('calls/x6').set(newCall('alice', 'bob', { admin: true })));
  await no('cannot backdate a call', alice.doc('calls/x7').set(newCall('alice', 'bob', { createdAt: firebase.firestore.Timestamp.fromMillis(1000) })));
  await no('call without an offer is rejected', alice.doc('calls/x8').set(newCall('alice', 'bob', { offer: { type: 'answer', sdp: 'v=0' } })));

  await seedCall('c1');
  await ok('caller reads the call', alice.doc('calls/c1').get());
  await ok('callee reads the call', bob.doc('calls/c1').get());
  await no('outsider cannot read the call', carol.doc('calls/c1').get());
  await ok('callee lists their ringing calls', bob.collection('calls').where('calleeId', '==', 'bob').where('status', '==', 'ringing').get());
  await ok('caller lists their calls', alice.collection('calls').where('callerId', '==', 'alice').get());
  await no('cannot list someone else\'s calls', carol.collection('calls').where('calleeId', '==', 'bob').get());
  await no('unfiltered call list is denied', carol.collection('calls').get());

  await no('caller cannot accept their own call', alice.doc('calls/c1').update({ status: 'accepted', answer, answeredAt: FV.serverTimestamp() }));
  await no('callee cannot cancel', bob.doc('calls/c1').update({ status: 'cancelled' }));
  await no('callee cannot mark missed', bob.doc('calls/c1').update({ status: 'missed' }));
  await no('outsider cannot decline', carol.doc('calls/c1').update({ status: 'declined' }));
  await no('declining cannot carry an answer', bob.doc('calls/c1').update({ status: 'declined', answer }));
  await no('callee cannot rewrite the participants', bob.doc('calls/c1').update({ status: 'accepted', answer, calleeId: 'carol' }));
  await no('ringing call cannot jump straight to ended', alice.doc('calls/c1').update({ status: 'ended' }));
  await ok('callee accepts with an answer', bob.doc('calls/c1').update({ status: 'accepted', answer, answeredAt: FV.serverTimestamp() }));
  await no('callee cannot decline after accepting', bob.doc('calls/c1').update({ status: 'declined' }));
  await ok('caller hangs up an answered call', alice.doc('calls/c1').update({ status: 'ended', endedAt: FV.serverTimestamp(), endedBy: 'alice' }));
  await no('an ended call cannot be reopened', bob.doc('calls/c1').update({ status: 'accepted', answer }));

  await seedCall('c2');
  await ok('callee declines', bob.doc('calls/c2').update({ status: 'declined' }));
  await seedCall('c3');
  await ok('caller cancels a ringing call', alice.doc('calls/c3').update({ status: 'cancelled' }));
  await seedCall('c4');
  await ok('caller marks an unanswered call missed', alice.doc('calls/c4').update({ status: 'missed' }));
  await seedCall('c5', 'accepted');
  await ok('callee can also end an answered call', bob.doc('calls/c5').update({ status: 'ended', endedAt: FV.serverTimestamp(), endedBy: 'bob' }));
  await no('calls cannot be deleted', alice.doc('calls/c5').delete());

  await seedCall('c6');
  const cand = (from) => ({ from, candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0, createdAt: FV.serverTimestamp(), expireAt: expire() });
  await ok('participant adds an ICE candidate', alice.collection('calls/c6/candidates').add(cand('alice')));
  await ok('other participant adds one too', bob.collection('calls/c6/candidates').add(cand('bob')));
  await no('cannot add a candidate as the other person', alice.collection('calls/c6/candidates').add(cand('bob')));
  await no('outsider cannot add a candidate', carol.collection('calls/c6/candidates').add(cand('carol')));
  await ok('participant reads candidates', bob.collection('calls/c6/candidates').get());
  console.log('\nCall media state (camera, mute)');
  const media = (extra = {}) => ({ cameraOff: false, muted: false, ...extra });
  await ok('participant says their camera is off', alice.doc('calls/c6/media/alice').set(media({ cameraOff: true })));
  await ok('participant says they are muted', alice.doc('calls/c6/media/alice').set(media({ muted: true })));
  await ok('other participant reads it', bob.doc('calls/c6/media/alice').get());
  await ok('participant turns both back on', alice.doc('calls/c6/media/alice').set(media()));
  await no('cannot write the other person\'s state', alice.doc('calls/c6/media/bob').set(media({ muted: true })));
  await no('outsider cannot read media state', carol.doc('calls/c6/media/alice').get());
  await no('outsider cannot write media state', carol.doc('calls/c6/media/carol').set(media({ muted: true })));
  await no('cameraOff must be a boolean', alice.doc('calls/c6/media/alice').set(media({ cameraOff: 'yes' })));
  await no('muted must be a boolean', alice.doc('calls/c6/media/alice').set(media({ muted: 'yes' })));
  await no('unexpected fields are refused', alice.doc('calls/c6/media/alice').set(media({ admin: true })));
  await no('media state cannot be deleted', alice.doc('calls/c6/media/alice').delete());
  await no('outsider cannot read candidates', carol.collection('calls/c6/candidates').get());

  console.log(`\n${passed} passed, ${failed} failed`);
  await env.cleanup();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
