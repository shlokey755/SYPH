/**
 * dateLabels.ts
 * The day labels in a chat: "Today", "Yesterday", then "Saturday, 31 Oct" (with the year when it is not this year).
 * No React, no Firebase: keep it dependency-free so it can be unit tested with plain Node. Days are the phone's local
 * days, so a message sent at 11:50 pm and one at 12:10 am are on different days.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (ms: number): number => {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

/** The label for the day a message was sent. `now` is injectable for tests. */
export function dayLabel(ms: number, now: number = Date.now()): string {
  // Rounded, not floored, so a clock change (daylight saving) cannot turn yesterday into two days ago.
  const daysAgo = Math.round((startOfDay(now) - startOfDay(ms)) / DAY_MS);
  if (daysAgo <= 0) return 'Today'; // a phone clock a little ahead of the server still reads as today
  if (daysAgo === 1) return 'Yesterday';
  const date = new Date(ms);
  const label = `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === new Date(now).getFullYear() ? label : `${label} ${date.getFullYear()}`;
}

/**
 * For messages listed newest first (as the chat does), the label to show above each one, or null when the message
 * is from the same day as the one before it. A time of 0 is a message still being sent: it is the newest, so today.
 */
export function dayHeaders(timesNewestFirst: readonly number[], now: number = Date.now()): (string | null)[] {
  return timesNewestFirst.map((time, index) => {
    const ms = time || now;
    const older = timesNewestFirst[index + 1];
    if (older === undefined) return dayLabel(ms, now);
    return startOfDay(ms) === startOfDay(older || now) ? null : dayLabel(ms, now);
  });
}
