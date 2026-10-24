// The design's date style ("6 Jul – 18 Dec 2026"). Months are spelled out here rather than
// taken from Intl, whose en-GB "Sept" differs between ICU versions.
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Parts = Readonly<{ year: number; month: number; day: number }>;

/** `YYYY-MM-DD` → its parts; a calendar date, so no time zone is involved. */
const partsOf = (isoDate: string): Parts => {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map(Number);
  return { year, month, day };
};

const dayMonth = ({ day, month }: Parts) => `${day} ${months[month - 1] ?? ''}`;
const full = (parts: Parts) => `${dayMonth(parts)} ${parts.year}`;

/** "6 Jul – 18 Dec 2026", or "12 Jan 2026 – 26 Jun 2027" across years. */
export const dateRange = (startDate: string, endDate: string): string => {
  const start = partsOf(startDate);
  const end = partsOf(endDate);
  return start.year === end.year
    ? `${dayMonth(start)} – ${full(end)}`
    : `${full(start)} – ${full(end)}`;
};

/** "11 Jan 2027". */
export const formatDate = (isoDate: string): string => full(partsOf(isoDate));

/** A moment (ISO date-time) as its calendar day where the viewer is: "11 Jan 2027". */
export const formatDay = (isoDateTime: string): string => {
  const date = new Date(isoDateTime);
  return full({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
};

/** Today where the viewer is, as `YYYY-MM-DD`. */
export const today = (now = new Date()): string =>
  [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('-');

/**
 * `months` later, as `YYYY-MM-DD`. A day past the end of the target month is clamped
 * (31 Aug + 18 months → 29 Feb in a leap year).
 */
export const addMonths = (isoDate: string, count: number): string => {
  const { year, month, day } = partsOf(isoDate);
  const index = month - 1 + count;
  const targetYear = year + Math.floor(index / 12);
  const targetMonth = ((index % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return [targetYear, targetMonth + 1, Math.min(day, lastDay)]
    .map((part, i) => String(part).padStart(i === 0 ? 4 : 2, '0'))
    .join('-');
};

const utcOf = (isoDate: string): number => {
  const { year, month, day } = partsOf(isoDate);
  return Date.UTC(year, month - 1, day);
};

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((utcOf(to) - utcOf(from)) / 86_400_000);

/**
 * Today in UTC, as `YYYY-MM-DD`: the API's "today" for feedback months and notices (9.3
 * decision 3), so the dialog offers what the API accepts.
 */
export const utcToday = (now = new Date()): string => now.toISOString().slice(0, 10);
