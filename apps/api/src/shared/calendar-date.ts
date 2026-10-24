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
