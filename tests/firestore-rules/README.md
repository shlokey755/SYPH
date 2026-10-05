# Firestore rules tests

Exercises `firestore.rules` against the local Firestore emulator (membership, spoofing, receipts,
deletes, group admin rules).

```
cd tests/firestore-rules
npm install
npm test
```

Needs Java 11+ and network access to download the emulator jar on first run.
Run this before deploying rules (`firebase deploy --only firestore:rules`, or paste `firestore.rules`
into Firebase Console > Firestore > Rules).
