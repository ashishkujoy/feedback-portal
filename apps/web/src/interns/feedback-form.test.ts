import { describe, expect, it } from 'vitest';
import { utcToday } from '../batches/batch-dates.ts';
import { feedbackMonths, monthLabel, noticeDescription } from './feedback-form.ts';

const values = (batchStartsOn: string, today: string) =>
  feedbackMonths(batchStartsOn, today).options.map((option) => option.value);

describe('feedback months', () => {
  it("runs from today's month back to the batch's first, newest first, across years", () => {
    expect(values('2025-11-17', '2026-02-03')).toEqual([
      '2026-02-01',
      '2026-01-01',
      '2025-12-01',
      '2025-11-01',
    ]);
    expect(feedbackMonths('2025-11-17', '2026-02-03').notStarted).toBe(false);
  });

  it('is one month in a batch that started this month', () => {
    expect(values('2026-10-20', '2026-10-24')).toEqual(['2026-10-01']);
  });

  it("offers only the first month of a batch that hasn't started", () => {
    expect(feedbackMonths('2026-12-07', '2026-10-24')).toEqual({
      options: [{ value: '2026-12-01', label: 'December 2026' }],
      notStarted: true,
    });
  });

  it('names months in full', () => {
    expect(monthLabel('2026-09-01')).toBe('September 2026');
  });

  it("uses UTC's today, as the API does", () => {
    // 23:30 on 31 Oct in UTC is already 1 Nov in India.
    expect(utcToday(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10-31');
  });
});

describe('the notice line', () => {
  const ishita = { name: 'Ishita Rao', status: 'active', noticeEndsOn: null } as const;

  it('ends a month after today, clamped to a shorter month', () => {
    expect(noticeDescription(ishita, true, '2027-01-31', 'Pat Lee')).toBe(
      'Ends 28 Feb 2027. Pat Lee then lifts it or terminates. Nothing happens automatically.',
    );
  });
});
