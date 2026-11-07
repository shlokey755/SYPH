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

/** The day label of every message (newest first), not only the first of each day. Used to name the day being scrolled. */
export function dayLabelsEach(timesNewestFirst: readonly number[], now: number = Date.now()): string[] {
  return timesNewestFirst.map((time) => dayLabel(time || now, now));
}

/**
 * The day to show in the floating chip while scrolling: the day of the oldest message on screen, which is the one at the
 * top. The list is newest first and upside down, so that is the highest index. Null when nothing is on screen.
 */
export function floatingDayLabel(visibleIndexes: readonly number[], labels: readonly string[]): string | null {
  let top = -1;
  for (const index of visibleIndexes) {
    if (Number.isInteger(index) && index > top && index < labels.length) top = index;
  }
  return top < 0 ? null : labels[top];
}

/** The phone's own way of writing a clock time, "9:41 AM" or "09:41". */
const clockOf = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** "9:41 AM" for today, "Yesterday, 9:41 AM" or "Saturday, 31 Oct, 9:41 AM" for earlier days: when somebody read a message. */
export function timeWithDay(ms: number, now: number = Date.now()): string {
  const day = dayLabel(ms, now);
  return day === 'Today' ? clockOf(ms) : `${day}, ${clockOf(ms)}`;
}
