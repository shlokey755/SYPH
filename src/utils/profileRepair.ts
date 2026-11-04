/**
 * profileRepair.ts
 * Finding people by username reads two fields of their profile document (users/{uid}): `usernameLowercase`, which the
 * search matches against, and `uid`. A profile written by an older build, or edited by hand, can miss one or hold the name
 * with capitals. That person can search for everybody else, because the app quietly fills the gaps in its own copy, but
 * nobody can find them. This works out what to write back so they can be found.
 * No Firebase or React in here: keep it dependency-free so it can be unit tested with plain Node.
 */

export interface ProfileDocData {
  uid?: unknown;
  username?: unknown;
  usernameLowercase?: unknown;
}

export interface ProfilePatch {
  uid?: string;
  usernameLowercase?: string;
}

/** The fields to write to the profile document, or null when it is already fine. Needs a `username` to work from. */
export function profileRepairPatch(data: ProfileDocData, uid: string): ProfilePatch | null {
  const patch: ProfilePatch = {};
  if (data.uid !== uid) patch.uid = uid;
  const username = typeof data.username === 'string' ? data.username.trim() : '';
  if (username) {
    const lower = username.toLowerCase();
    if (data.usernameLowercase !== lower) patch.usernameLowercase = lower;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
