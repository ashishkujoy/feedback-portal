import { describe, expect, it } from 'vitest';
import { batchDates, batchStatus, inListOrder } from './batch-status.ts';

const batch = { startDate: '2027-01-11', endDate: '2028-06-25', isArchived: false };

describe('batchStatus', () => {
  it('is upcoming before the start, active through the end date, then completed', () => {
    expect(batchStatus(batch, '2027-01-10')).toBe('upcoming');
    expect(batchStatus(batch, '2027-01-11')).toBe('active');
    expect(batchStatus(batch, '2028-06-25')).toBe('active');
    expect(batchStatus(batch, '2028-06-26')).toBe('completed');
  });

  it('is archived whatever the dates', () => {
    expect(batchStatus({ ...batch, isArchived: true }, '2027-03-01')).toBe('archived');
  });
});

describe('batchDates', () => {
  it('says when an upcoming batch starts, and gives the range otherwise', () => {
    expect(batchDates(batch, 'upcoming')).toBe('Starts 11 Jan 2027');
    expect(batchDates(batch, 'active')).toBe('11 Jan 2027 – 25 Jun 2028');
  });
});

const named = (name: string, startDate: string, endDate: string, isArchived = false) => ({
  name,
  startDate,
  endDate,
  isArchived,
});

describe('inListOrder', () => {
  it('puts active first, then upcoming, completed and archived, keeping order within each', () => {
    const batches = [
      named('upcoming', '2028-01-10', '2029-06-25'),
      named('active, newer', '2027-02-01', '2028-07-01'),
      named('archived', '2027-01-04', '2028-06-01', true),
      named('active, older', '2027-01-11', '2028-06-25'),
      named('completed', '2025-01-13', '2026-06-26'),
    ];

    expect(inListOrder(batches, '2027-03-01').map(({ name }) => name)).toEqual([
      'active, newer',
      'active, older',
      'upcoming',
      'completed',
      'archived',
    ]);
  });
});
