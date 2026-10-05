import { Conversation, Message, MessageStatus } from '../types';
import { toMillis } from './conversation';

/**
 * Delivery state of a message you sent (FR-07).
 *
 * Receipts are stored as per-user watermarks on the conversation (readState[uid].deliveredAt / readAt),
 * so a message counts as delivered/read once every other member's watermark has passed its timestamp.
 */
export function getMessageStatus(
  message: Message,
  conversation: Conversation | undefined
): MessageStatus {
  if (message.pending) return 'pending';

  const sentAt = toMillis(message.createdAt);
  const others = (conversation?.participantIds ?? []).filter((id) => id !== message.senderId);
  if (!conversation || !sentAt || others.length === 0) return 'sent';

  let allDelivered = true;
  let allRead = true;
  for (const uid of others) {
    const receipt = conversation.readState?.[uid];
    const readAt = toMillis(receipt?.readAt);
    const deliveredAt = Math.max(toMillis(receipt?.deliveredAt), readAt);
    if (readAt < sentAt) allRead = false;
    if (deliveredAt < sentAt) allDelivered = false;
  }

  if (allRead) return 'read';
  if (allDelivered) return 'delivered';
  return 'sent';
}
