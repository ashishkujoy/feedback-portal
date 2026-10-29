import type { BatchOverview } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { distributionNote, distributionRows, noticeLeft, waitingLabel } from './overview.ts';

const overview: BatchOverview = {
  current: 65,
  onNoticeCount: 4,
  colours: {
    green: 12,
    yellow: 18,
    borderline_yellow: 8,
    orange: 6,
    borderline_red: 5,
    red: 4,
    none: 12,
  },
  onNotice: [],
  toDeliver: [],
};

describe('the colour distribution', () => {
  it('has a row per colour, green to red then none, with shares and percentages', () => {
    const rows = distributionRows(overview);
    expect(rows.map(({ label, count, percent }) => `${label} ${count} ${percent}`)).toEqual([
      'Green 12 18%',
      'Yellow 18 28%',
      'Borderline Yellow 8 12%',
      'Orange 6 9%',
      'Borderline Red 5 8%',
      'Red 4 6%',
      'No colour 12 18%',
    ]);
    expect(rows[1]).toMatchObject({ share: '27.7%', relative: '100%' });
    expect(rows[0]?.relative).toBe('67%');
  });

  it('says how many current interns there are', () => {
    expect(distributionNote(overview)).toBe(
      '65 current interns, including 4 on notice. Excludes terminated and withdrawn.',
    );
    expect(distributionNote({ ...overview, current: 1, onNoticeCount: 0 })).toBe(
      '1 current intern, including 0 on notice. Excludes terminated and withdrawn.',
    );
  });

  it('copes with no interns', () => {
    const empty = {
      ...overview,
      current: 0,
      colours: {
        ...overview.colours,
        green: 0,
        yellow: 0,
        borderline_yellow: 0,
        orange: 0,
        borderline_red: 0,
        red: 0,
        none: 0,
      },
    };
    expect(
      distributionRows(empty).every((row) => row.share === '0.0%' && row.relative === '0%'),
    ).toBe(true);
  });
});

describe('notice and waiting', () => {
  it('counts the days left, urgent at seven, then a decision once it has ended', () => {
    expect(noticeLeft('2026-11-08', '2026-10-24')).toEqual({
      kind: 'running',
      label: '15 days left',
      urgent: false,
    });
    expect(noticeLeft('2026-10-31', '2026-10-24')).toEqual({
      kind: 'running',
      label: '7 days left',
      urgent: true,
    });
    expect(noticeLeft('2026-10-25', '2026-10-24')).toMatchObject({ label: '1 day left' });
    expect(noticeLeft('2026-10-24', '2026-10-24')).toMatchObject({
      label: '0 days left',
      urgent: true,
    });
    expect(noticeLeft('2026-10-23', '2026-10-24')).toEqual({ kind: 'ended' });
  });

  it('says how long feedback has waited, in UTC days', () => {
    const now = new Date('2026-10-24T01:00:00Z');
    expect(waitingLabel('2026-10-24T00:30:00.000Z', now)).toBe('waiting today');
    expect(waitingLabel('2026-10-23T23:30:00.000Z', now)).toBe('waiting 1 day');
    expect(waitingLabel('2026-10-19T12:00:00.000Z', now)).toBe('waiting 5 days');
  });
});
