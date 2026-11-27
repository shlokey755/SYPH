/**
 * useCallLog.ts
 * The call log between the signed-in person and one other person, newest first, kept up to date while the screen is open.
 */

import { useEffect, useState } from 'react';
import { subscribeCallLog } from '../services/callLogService';
import { CallLogEntry, buildCallLog } from '../utils/callLog';

interface CallLogState {
  entries: CallLogEntry[];
  loading: boolean;
  /** The calls could not be read (offline with nothing saved, or the rules refused the query). */
  failed: boolean;
}

export function useCallLog(myUid: string | undefined, otherUid: string | undefined): CallLogState {
  const [state, setState] = useState<CallLogState>({ entries: [], loading: true, failed: false });

  useEffect(() => {
    if (!myUid || !otherUid) {
      setState({ entries: [], loading: false, failed: false });
      return;
    }
    setState({ entries: [], loading: true, failed: false });
    return subscribeCallLog(
      myUid,
      otherUid,
      (records) => setState({ entries: buildCallLog(records, myUid, Date.now()), loading: false, failed: false }),
      (error) => {
        console.warn('Call log failed:', (error as { message?: string } | undefined)?.message ?? error);
        setState((previous) => ({ ...previous, loading: false, failed: true }));
      }
    );
  }, [myUid, otherUid]);

  return state;
}
