import { describe, expect, it } from 'vitest';
import { addMonths } from './calendar-date.ts';

describe('addMonths', () => {
  it('adds calendar months, clamping to the end of a shorter month', () => {
    expect(addMonths('2027-04-01', 1)).toBe('2027-05-01');
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2027-12-15', 1)).toBe('2028-01-15');
    expect(addMonths('2027-01-11', 18)).toBe('2028-07-11');
  });
});
