import { describe, expect, it } from 'vitest';
import { addMonths, dateRange, formatDate, formatDay, today } from './batch-dates.ts';

describe('batch dates', () => {
  it('shows a range within a year with one year, and across years with both', () => {
    expect(dateRange('2026-07-06', '2026-12-18')).toBe('6 Jul – 18 Dec 2026');
    expect(dateRange('2026-01-12', '2027-06-26')).toBe('12 Jan 2026 – 26 Jun 2027');
  });

  it('spells September as Sep, whatever the ICU version', () => {
    expect(formatDate('2026-09-14')).toBe('14 Sep 2026');
  });

  it('shows a moment as its local day', () => {
    const moment = new Date(2027, 0, 11, 23, 30);

    expect(formatDay(moment.toISOString())).toBe('11 Jan 2027');
  });

  it("gives today's local date", () => {
    expect(today(new Date(2027, 1, 3, 0, 5))).toBe('2027-02-03');
  });

  it('adds months, clamping to the end of a shorter month', () => {
    expect(addMonths('2027-01-11', 18)).toBe('2028-07-11');
    expect(addMonths('2026-08-31', 18)).toBe('2028-02-29');
    expect(addMonths('2027-08-31', 18)).toBe('2029-02-28');
    expect(addMonths('2027-12-15', 1)).toBe('2028-01-15');
  });
});
