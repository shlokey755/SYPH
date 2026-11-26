/**
 * useSharedEmail.ts
 * The email somebody has shared in a chat (see utils/contactEmail.ts), kept up to date while the screen is open.
 */

import { useEffect, useState } from 'react';
import { subscribeSharedEmail } from '../services/contactEmailService';
import { SharedEmail, sharedEmailOf } from '../utils/contactEmail';

export function useSharedEmail(conversationId: string | undefined, uid: string | undefined): SharedEmail {
  const [shared, setShared] = useState<SharedEmail>({ status: 'loading', email: '' });

  useEffect(() => {
    if (!conversationId || !uid) {
      setShared({ status: 'notShared', email: '' });
      return;
    }
    setShared({ status: 'loading', email: '' });
    return subscribeSharedEmail(
      conversationId,
      uid,
      (exists, email) => setShared(sharedEmailOf(exists, email)),
      (error) => {
        console.warn('Shared email failed:', (error as { message?: string } | undefined)?.message ?? error);
        setShared({ status: 'error', email: '' });
      }
    );
  }, [conversationId, uid]);

  return shared;
}
