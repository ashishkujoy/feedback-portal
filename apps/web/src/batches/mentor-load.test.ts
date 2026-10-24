import { describe, expect, it } from 'vitest';
import { mentorLoad } from './mentor-load.ts';

const active = { startDate: '2027-01-11', endDate: '2028-06-25' };
const upcoming = { startDate: '2028-01-10', endDate: '2029-06-25' };
const completed = { startDate: '2025-01-13', endDate: '2026-06-26' };
const today = '2027-03-01';

describe('mentorLoad', () => {
  it('counts active and upcoming batches, and ignores completed ones', () => {
    expect(mentorLoad([active], today)).toBe('1 active batch');
    expect(mentorLoad([active, active], today)).toBe('2 active batches');
    expect(mentorLoad([upcoming], today)).toBe('1 upcoming batch');
    expect(mentorLoad([active, upcoming, completed], today)).toBe('1 active, 1 upcoming');
    expect(mentorLoad([completed], today)).toBe('Unassigned');
    expect(mentorLoad([], today)).toBe('Unassigned');
  });
});
