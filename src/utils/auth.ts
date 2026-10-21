/**
 * auth.ts
 * Pure account rules, shared by the screens and the auth hook, and unit tested (tests/unit/auth.test.ts).
 *
 * Two kinds of account exist:
 *   - username-only (the original kind): Firebase needs an email, so the app uses `<username>@syph.com`
 *   - email accounts: the person's real email is the Firebase email and they sign in with it
 * Usernames are public handles in both cases; they are never the sign-in secret for an email account.
 */

/** Domain used for username-only accounts. Not a real mailbox, so it can never receive a reset email. */
export const USERNAME_ONLY_DOMAIN = 'syph.com';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 6; // Firebase's own minimum
export const DISPLAY_NAME_MAX = 40;

/** Lowercase form used for lookups and for the username registry document id. */
export const normalizeUsername = (raw: string): string => raw.trim().toLowerCase();

/**
 * New usernames: 3-20 letters, digits, "_" or ".", starting and ending with a letter or digit, no "..".
 * That is also exactly what is safe to place before "@syph.com". Existing accounts are not re-checked.
 * Returns an error message, or null when valid.
 */
export function validateUsername(raw: string): string | null {
  const name = raw.trim();
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
    return `Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters.`;
  }
  if (!/^[A-Za-z0-9._]+$/.test(name)) {
    return 'Username can only use letters, numbers, "." and "_".';
  }
  if (!/^[A-Za-z0-9]/.test(name) || !/[A-Za-z0-9]$/.test(name)) {
    return 'Username must start and end with a letter or number.';
  }
  if (name.includes('..')) return 'Username cannot contain two dots in a row.';
  return null;
}

export const isLegacyEmail = (email: string | null | undefined): boolean =>
  !!email && email.toLowerCase().endsWith(`@${USERNAME_ONLY_DOMAIN}`);

/** Returns an error message, or null when it looks like a usable real email. */
export function validateEmail(raw: string): string | null {
  const email = raw.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Enter a valid email address.';
  if (isLegacyEmail(email)) return `Addresses ending in @${USERNAME_ONLY_DOMAIN} are reserved. Use your own email.`;
  return null;
}

export function validatePassword(password: string): string | null {
  return password.length >= PASSWORD_MIN ? null : `Password must be at least ${PASSWORD_MIN} characters.`;
}

/** The Firebase email behind a username-only account. */
export const usernameOnlyEmail = (username: string): string =>
  `${normalizeUsername(username)}@${USERNAME_ONLY_DOMAIN}`;

/** What someone typed into the sign-in box: an email is used as is, anything else is a username. */
export function loginEmailFor(identifier: string): string {
  const value = identifier.trim().toLowerCase();
  return value.includes('@') ? value : usernameOnlyEmail(value);
}

export const looksLikeEmail = (identifier: string): boolean => identifier.includes('@');

export type AuthContext = 'login' | 'register' | 'reset' | 'email' | 'general';

/**
 * Plain-language text for Firebase Auth error codes.
 * `emailGiven` matters for "already in use": with no email it means the username is taken.
 */
export function friendlyAuthError(code: string | undefined, context: AuthContext, emailGiven = true): string | null {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-login-credentials':
      return 'Wrong username/email or password.';
    case 'auth/email-already-in-use':
      return context === 'register' && !emailGiven
        ? 'That username is taken.'
        : 'An account with this email already exists.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
      return `Password must be at least ${PASSWORD_MIN} characters.`;
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'No internet connection. Check your network and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/requires-recent-login':
      return 'For security, log out and back in, then try again.';
    case 'auth/operation-not-allowed':
      return context === 'email'
        ? 'Email changes are not enabled for this account. Contact support.'
        : 'This sign-in method is not enabled yet.';
    default:
      return null;
  }
}
