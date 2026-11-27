/**
 * contactEmail.ts
 * Pure rules for the email on a contact's profile screen. No React, no Firebase, so plain Node can test it.
 *
 * Nobody's email is in the public profile (users/{uid}, which every signed-in account can read) and Firebase does not let one
 * account read another's sign-in email. So each person writes their own email into the chat they share with someone:
 * conversations/{chatId}/contacts/{theirUid}, which only the two people in that chat can read (firestore.rules). It is written
 * when they open the chat, and again only when the email changed, which is what the saved list below is for.
 *
 * What the profile screen can find there:
 *   - nothing yet:        the other person has not opened this chat on a build that shares it ("Not shared yet")
 *   - an empty email:     they have no real email, only a username ("No email added")
 *   - an email:           shown
 */

export type SharedEmailStatus = 'loading' | 'notShared' | 'none' | 'email' | 'error';

export interface SharedEmail {
  status: SharedEmailStatus;
  email: string;
}

/** What was found at conversations/{chatId}/contacts/{uid}. */
export function sharedEmailOf(exists: boolean, email: unknown): SharedEmail {
  if (!exists) return { status: 'notShared', email: '' };
  const text = typeof email === 'string' ? email.trim() : '';
  return text ? { status: 'email', email: text } : { status: 'none', email: '' };
}

/** The line shown under "Email". */
export function emailLine(shared: SharedEmail): string {
  switch (shared.status) {
    case 'email':
      return shared.email;
    case 'none':
      return 'No email added';
    case 'notShared':
      return 'Not shared yet';
    case 'error':
      return 'Could not load';
    default:
      return '...';
  }
}

// ----- what this phone has already shared -----

/** Chat by chat, the email this phone last wrote ('' = "no email"). The key names the account too: two people can share a phone. */
export type SharedMap = Record<string, string>;

export const shareKey = (uid: string, conversationId: string): string => `${uid}/${conversationId}`;

export function parseShared(raw: string | null | undefined): SharedMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: SharedMap = {};
    for (const [key, value] of Object.entries(parsed)) if (typeof value === 'string') out[key] = value;
    return out;
  } catch {
    return {};
  }
}

export const serializeShared = (map: SharedMap): string => JSON.stringify(map);

/** True when this chat has not been given this email from this phone yet. */
export const needsSharing = (map: SharedMap, uid: string, conversationId: string, email: string): boolean =>
  map[shareKey(uid, conversationId)] !== email;

export const withShared = (map: SharedMap, uid: string, conversationId: string, email: string): SharedMap => ({
  ...map,
  [shareKey(uid, conversationId)]: email,
});
