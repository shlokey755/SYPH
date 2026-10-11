/**
 * accountService.ts
 * Username ownership and email management for the signed-in account (FR-01, FR-02).
 *
 * Usernames are unique across both kinds of account (see utils/auth.ts). Two things guarantee it:
 *   - existing accounts hold their name in users/{uid}.usernameLowercase
 *   - new claims are also written to usernames/{lowercase}; the rules allow a document to be created only once,
 *     so two people racing for the same name cannot both win.
 */

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { normalizeUsername } from '../utils/auth';

/** Thrown when the username registry cannot be reached, almost always because the new rules are not published. */
export class RegistryUnavailableError extends Error {
  constructor() {
    super('Could not check username availability. Make sure the latest Firestore rules are published (see API.md).');
    this.name = 'RegistryUnavailableError';
  }
}

const isPermissionDenied = (error: unknown) => (error as { code?: string } | null)?.code === 'permission-denied';

/**
 * True when nobody else holds the name. Checks existing profiles (accounts that predate the registry) and the registry.
 * `myUid` is ignored as a holder, so keeping or re-claiming your own name is fine.
 */
export async function isUsernameAvailable(username: string, myUid: string): Promise<boolean> {
  const lower = normalizeUsername(username);
  try {
    const holders = await getDocs(
      query(collection(db, 'users'), where('usernameLowercase', '==', lower), limit(2))
    );
    if (holders.docs.some((d) => d.id !== myUid)) return false;

    const claim = await getDoc(doc(db, 'usernames', lower));
    return !claim.exists() || claim.data()?.uid === myUid;
  } catch (error) {
    if (isPermissionDenied(error)) throw new RegistryUnavailableError();
    throw error;
  }
}

/** Claims the name for `uid`. Returns false if someone else got it first. */
export async function claimUsername(uid: string, username: string): Promise<boolean> {
  const ref = doc(db, 'usernames', normalizeUsername(username));
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) return existing.data()?.uid === uid;
    await setDoc(ref, { uid, createdAt: serverTimestamp() });
    return true;
  } catch (error) {
    if (!isPermissionDenied(error)) throw error;
    // The create was refused. If the name now exists under someone else it was a lost race; if it still does not
    // exist (or cannot even be read) the rules are the problem, not the name.
    try {
      const after = await getDoc(ref);
      if (after.exists()) return after.data()?.uid === uid;
    } catch {
      // fall through
    }
    throw new RegistryUnavailableError();
  }
}

/** Gives a name back. Best effort: accounts that predate the registry have nothing to release. */
export async function releaseUsername(uid: string, username: string): Promise<void> {
  const ref = doc(db, 'usernames', normalizeUsername(username));
  try {
    const existing = await getDoc(ref);
    if (existing.exists() && existing.data()?.uid === uid) await deleteDoc(ref);
  } catch (error) {
    console.warn('Could not release username:', error instanceof Error ? error.message : error);
  }
}

// ---------- Email ----------

/** Sends the verification mail for the signed-in account. */
export async function sendVerificationEmail(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  await sendEmailVerification(user);
}

/** Re-reads the account from Firebase so `emailVerified` and `email` are current. Returns the fresh values. */
export async function refreshAccountEmail(): Promise<{ email: string | null; verified: boolean }> {
  const user = auth.currentUser;
  if (!user) return { email: null, verified: false };
  await user.reload();
  return { email: user.email, verified: user.emailVerified };
}

/**
 * Starts moving the account to a real email. Firebase mails a confirmation link to the NEW address and only
 * switches the sign-in email once it is clicked, so nobody can lock themselves out with a typo.
 * Needs a fresh sign-in, so the current password is checked first.
 */
export async function requestEmailChange(newEmail: string, currentPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Not signed in');
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
  await verifyBeforeUpdateEmail(user, newEmail.trim().toLowerCase());
}

/** Sends a reset link. Firebase does not reveal whether the address has an account, and neither do we. */
export function requestPasswordReset(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email.trim().toLowerCase());
}
