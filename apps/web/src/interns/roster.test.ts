import type { InternSummary } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import {
  byName,
  filterLabels,
  inFilter,
  internBadge,
  isReadOnly,
  matchesUsername,
  RosterFilter,
  rosterCounts,
  summaryKeys,
} from './roster.ts';

let n = 0;
const intern = (overrides: Partial<InternSummary> = {}): InternSummary => {
  n += 1;
  return {
    id: `01890a5d-ac96-774b-bcce-b3020900${String(n).padStart(4, '0')}`,
    batchId: '01890a5d-ac96-774b-bcce-b30209000001',
    username: `intern.${n}`,
    name: `Intern ${n}`,
    email: `intern${n}@example.com`,
    status: 'active',
    colorCode: null,
    noticeEndsOn: null,
    ...overrides,
  };
};

describe('filters', () => {
  const roster = [
    intern({ colorCode: 'green' }),
    intern({ colorCode: 'borderline_yellow' }),
    intern({ colorCode: 'red', status: 'on_notice', noticeEndsOn: '2027-04-01' }),
    intern({ colorCode: 'red', status: 'terminated' }),
    intern({ status: 'withdrawn' }),
    intern({ colorCode: 'green', status: 'graduated' }),
    intern(),
  ];

  it('count each colour (no code is "No colour") and each status apart from Active', () => {
    const count = rosterCounts(roster);

    expect(RosterFilter.options.map((filter) => [filter, count(filter)])).toEqual([
      ['all', 7],
      ['green', 2],
      ['yellow', 0],
      ['borderline_yellow', 1],
      ['orange', 0],
      ['borderline_red', 0],
      ['red', 2],
      ['none', 2],
      ['on_notice', 1],
      ['terminated', 1],
      ['withdrawn', 1],
      ['graduated', 1],
    ]);
  });

  it('follow v2: All, then the colours with No colour, then the statuses', () => {
    expect((['all', ...summaryKeys] as const).map((filter) => filterLabels[filter])).toEqual([
      'All',
      'Green',
      'Yellow',
      'Borderline Yellow',
      'Orange',
      'Borderline Red',
      'Red',
      'No colour',
      'On notice',
      'Terminated',
      'Withdrawn',
      'Graduated',
    ]);
  });

  it('select by status, not by colour, for the status filters', () => {
    expect(roster.filter((i) => inFilter(i, 'terminated')).map((i) => i.status)).toEqual([
      'terminated',
    ]);
    expect(roster.filter((i) => inFilter(i, 'red')).map((i) => i.status)).toEqual([
      'on_notice',
      'terminated',
    ]);
  });
});

describe('matchesUsername', () => {
  const ishita = intern({ username: 'ishita.rao', name: 'Zed' });

  it.each(['ishita', 'ISHITA', '@Ishita.R', '  rao ', ''])('matches %j', (search) => {
    expect(matchesUsername(ishita, search)).toBe(true);
  });

  it('ignores the name', () => {
    expect(matchesUsername(ishita, 'zed')).toBe(false);
  });
});

describe('byName', () => {
  it("sorts as people read names: case and accents don't split the list", () => {
    const names = ['zoya', 'Émile', 'aarav', 'Eva', 'Bo'].map((name) => intern({ name }));

    expect(byName(names).map((i) => i.name)).toEqual(['aarav', 'Bo', 'Émile', 'Eva', 'zoya']);
  });
});

const onNotice = (noticeEndsOn: string) => intern({ status: 'on_notice', noticeEndsOn });

describe('internBadge', () => {
  const today = '2027-03-17';

  it('shows the days left of a notice', () => {
    expect(internBadge(onNotice('2027-04-01'), today)).toEqual({
      label: 'On notice · 15 days left',
      type: 'error',
    });
    expect(internBadge(onNotice('2027-03-18'), today)?.label).toBe('On notice · 1 day left');
    expect(internBadge(onNotice('2027-03-17'), today)?.label).toBe('On notice · 0 days left');
  });

  it('asks for a decision once the notice has ended', () => {
    expect(internBadge(onNotice('2027-03-16'), today)).toEqual({
      label: 'Notice ended · decision needed',
      type: 'warning',
    });
  });

  it('shows the final statuses, and nothing while active', () => {
    expect(
      (['graduated', 'terminated', 'withdrawn', 'active'] as const).map((status) =>
        internBadge(intern({ status }), today),
      ),
    ).toEqual([
      { label: 'Graduated', type: 'success' },
      { label: 'Terminated', type: 'neutral' },
      { label: 'Withdrawn', type: 'neutral' },
      null,
    ]);
  });
});

describe('isReadOnly', () => {
  it('is true for final statuses, and for everyone in an archived batch', () => {
    const open = { isArchived: false };
    expect(
      (['active', 'on_notice', 'graduated', 'terminated', 'withdrawn'] as const).map((status) =>
        isReadOnly(intern({ status }), open),
      ),
    ).toEqual([false, false, true, true, true]);
    expect(isReadOnly(intern(), { isArchived: true })).toBe(true);
  });
});
