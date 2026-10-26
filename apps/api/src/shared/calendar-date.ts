/**
 * Calendar dates as `YYYY-MM-DD` strings, as the database's `date` columns are read: no time
 * zone, so nothing shifts them.
 */

/**
 * `count` months later. A day past the end of the target month is clamped
 * (31 Jan + 1 month → 28 Feb, or 29 Feb in a leap year).
 */
export const addMonths = (isoDate: string, count: number): string => {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map(Number);
  const index = month - 1 + count;
  const targetYear = year + Math.floor(index / 12);
  const targetMonth = ((index % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return [targetYear, targetMonth + 1, Math.min(day, lastDay)]
    .map((part, i) => String(part).padStart(i === 0 ? 4 : 2, '0'))
    .join('-');
};

/** The calendar date in UTC (9.3 decision 3): the server's "today" for notices and months. */
export const utcToday = (now: Date): string => now.toISOString().slice(0, 10);

const shortMonths = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "12 Oct 2026", as the web shows dates, for messages people read. */
export const dayLabel = (isoDate: string): string => {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map(Number);
  return `${day} ${shortMonths[month - 1] ?? ''} ${year}`;
};
