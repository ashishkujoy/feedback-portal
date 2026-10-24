import { describe, expect, it } from 'vitest';
import { addMonths, utcToday } from './calendar-date.ts';

describe('addMonths', () => {
  it('adds calendar months, clamping to the end of a shorter month', () => {
    expect(addMonths('2027-04-01', 1)).toBe('2027-05-01');
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2027-12-15', 1)).toBe('2028-01-15');
    expect(addMonths('2027-01-11', 18)).toBe('2028-07-11');
  });
});

describe('utcToday', () => {
  it('is the UTC calendar date, whatever the local one', () => {
    expect(utcToday(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10-31');
    // 05:00 in India on 1 November, still 31 October in UTC.
    expect(utcToday(new Date('2026-11-01T05:00:00+05:30'))).toBe('2026-10-31');
    expect(utcToday(new Date('2026-11-01T00:00:00Z'))).toBe('2026-11-01');
  });
});
