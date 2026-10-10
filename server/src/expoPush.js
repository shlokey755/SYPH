/**
 * expoPush.js
 * Sends messages through Expo's push service and prunes tokens Expo reports as dead.
 * Dependencies are injected so the logic is unit tested without a network (test/expoPush.test.js).
 *
 * Expo is two-step: sending returns a "ticket" per message; a later "receipt" says whether delivery to
 * Apple/Google worked. DeviceNotRegistered in either means the app was uninstalled or the token expired.
 */

import { Expo } from 'expo-server-sdk';

const RECEIPT_MIN_AGE_MS = 2 * 60 * 1000; // Expo asks for ~15 min in docs, but receipts are usually ready much sooner
const RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // Expo discards receipts after 24h

/**
 * @param {object} deps
 * @param {import('expo-server-sdk').Expo} deps.expo               client (or a compatible fake)
 * @param {(uid: string, token: string) => Promise<void>} deps.removeToken
 * @param {{ info: Function, warn: Function }} [deps.log]
 * @param {() => number} [deps.now]
 */
export function createPushSender({ expo, removeToken, log = console, now = () => Date.now() }) {
  /** Receipt ids waiting to be checked: { id, uid, token, at } */
  let pending = [];

  async function prune(uid, token, reason) {
    log.info(`Removing dead push token (${reason}) for user ${uid}`);
    try {
      await removeToken(uid, token);
    } catch (error) {
      log.warn('Could not remove push token:', error);
    }
  }

  /**
   * @param {{ uid: string, message: import('expo-server-sdk').ExpoPushMessage }[]} entries
   * @returns {Promise<{ sent: number, failed: number }>}
   */
  async function send(entries) {
    const valid = [];
    for (const entry of entries) {
      if (Expo.isExpoPushToken(entry.message.to)) valid.push(entry);
      else await prune(entry.uid, String(entry.message.to), 'not an Expo token');
    }

    let sent = 0;
    let failed = 0;
    let offset = 0;
    // Messages have a single recipient each, so chunking keeps order and tickets line up one to one.
    for (const chunk of expo.chunkPushNotifications(valid.map((e) => e.message))) {
      const group = valid.slice(offset, offset + chunk.length);
      offset += chunk.length;

      let tickets;
      try {
        tickets = await expo.sendPushNotificationsAsync(chunk);
      } catch (error) {
        // Network or Expo outage: nothing says the tokens are bad, so keep them.
        log.warn('Expo push request failed:', error);
        failed += chunk.length;
        continue;
      }

      for (let i = 0; i < group.length; i++) {
        const { uid, message } = group[i];
        const ticket = tickets[i];
        if (ticket?.status === 'ok') {
          sent++;
          pending.push({ id: ticket.id, uid, token: message.to, at: now() });
        } else {
          failed++;
          if (ticket?.details?.error === 'DeviceNotRegistered') {
            await prune(uid, message.to, 'ticket DeviceNotRegistered');
          } else {
            log.warn('Push ticket error:', ticket?.message, ticket?.details);
          }
        }
      }
    }
    return { sent, failed };
  }

  /** Looks up receipts that are old enough and prunes tokens reported as DeviceNotRegistered. */
  async function checkReceipts() {
    const current = now();
    const due = pending.filter((p) => current - p.at >= RECEIPT_MIN_AGE_MS);
    if (due.length === 0) return { checked: 0, pruned: 0 };

    const byId = new Map(due.map((p) => [p.id, p]));
    const finished = new Set();
    let pruned = 0;

    for (const ids of expo.chunkPushNotificationReceiptIds(due.map((p) => p.id))) {
      let receipts;
      try {
        receipts = await expo.getPushNotificationReceiptsAsync(ids);
      } catch (error) {
        log.warn('Could not fetch push receipts:', error);
        continue; // try again on the next pass
      }

      for (const id of ids) {
        const receipt = receipts[id];
        const entry = byId.get(id);
        if (!receipt) {
          if (current - entry.at > RECEIPT_MAX_AGE_MS) finished.add(id); // gone for good
          continue; // not ready yet
        }
        finished.add(id);
        if (receipt.status === 'error') {
          if (receipt.details?.error === 'DeviceNotRegistered') {
            pruned++;
            await prune(entry.uid, entry.token, 'receipt DeviceNotRegistered');
          } else {
            log.warn('Push receipt error:', receipt.message, receipt.details);
          }
        }
      }
    }

    pending = pending.filter((p) => !finished.has(p.id));
    return { checked: finished.size, pruned };
  }

  return { send, checkReceipts, pendingCount: () => pending.length };
}
