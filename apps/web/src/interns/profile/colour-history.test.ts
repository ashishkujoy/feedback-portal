import type { FeedbackView, InternDetail, InternStatusEvent } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { chartColumns, colourHistory, historyEnd, stripSegments } from './colour-history.ts';

let next = 0;
const entry = (overrides: Partial<FeedbackView> = {}): FeedbackView => ({
  id: `01890a5d-ac96-774b-bcce-b302090001${String((next += 1)).padStart(2, '0')}`,
  internId: '01890a5d-ac96-774b-bcce-b30209000002',
  period: '2026-10-01',
  body: 'Text',
  colorCode: null,
  previousColorCode: null,
  givesNotice: false,
  state: 'submitted',
  author: { id: '01890a5d-ac96-774b-bcce-b30209000004', name: 'Pat Lee', avatarUrl: null },
  conversationId: null,
  submittedAt: '2026-10-08T12:00:00.000Z',
  createdAt: '2026-10-08T12:00:00.000Z',
  updatedAt: '2026-10-08T12:00:00.000Z',
  editedAt: null,
  deliveredOn: null,
  ...overrides,
});

const point = (code: FeedbackView['colorCode'] & string, at: string) => ({ id: at, code, at });

describe('the colour history', () => {
  it('has the colours submitted feedback gave, oldest first', () => {
    const october = entry({ colorCode: 'red', state: 'delivered' });
    const july = entry({ colorCode: 'yellow', submittedAt: '2026-07-24T12:00:00.000Z' });
    expect(
      colourHistory([
        entry({ state: 'draft', colorCode: 'green', submittedAt: null }),
        entry({ colorCode: null, submittedAt: '2026-10-22T12:00:00.000Z' }),
        october,
        july,
      ]),
    ).toEqual([
      { id: july.id, code: 'yellow', at: '2026-07-24T12:00:00.000Z' },
      { id: october.id, code: 'red', at: '2026-10-08T12:00:00.000Z' },
    ]);
  });
});

describe('the strip', () => {
  const history = [
    point('yellow', '2026-07-11T12:00:00.000Z'),
    point('orange', '2026-07-21T12:00:00.000Z'),
    point('orange', '2026-07-26T12:00:00.000Z'),
    point('red', '2026-07-31T12:00:00.000Z'),
  ];

  it('sizes each colour by its days, with no colour first and repeats merged', () => {
    // 1 Jul → 10 Aug is 40 days: none 10, yellow 10, orange 10, red 10.
    const segments = stripSegments(history, '2026-07-01', '2026-08-10');
    expect(segments).toEqual([
      { code: null, from: '2026-07-01', share: 0.25 },
      { code: 'yellow', from: '2026-07-11', share: 0.25 },
      { code: 'orange', from: '2026-07-21', share: 0.25 },
      { code: 'red', from: '2026-07-31', share: 0.25 },
    ]);
  });

  it('starts with the first colour when it came on the first day', () => {
    expect(
      stripSegments([point('green', '2026-07-01T09:00:00.000Z')], '2026-07-01', '2026-07-05'),
    ).toEqual([{ code: 'green', from: '2026-07-01', share: 1 }]);
  });

  it('is empty before the batch starts', () => {
    expect(stripSegments(history, '2026-07-01', '2026-06-20')).toEqual([]);
    expect(stripSegments(history, '2026-07-01', '2026-07-01')).toEqual([]);
  });
});

const intern = (overrides: Partial<InternDetail>): InternDetail => ({
  id: '01890a5d-ac96-774b-bcce-b30209000002',
  batchId: '01890a5d-ac96-774b-bcce-b30209000001',
  username: 'meera.pillai',
  name: 'Meera Pillai',
  email: 'meera@example.com',
  status: 'active',
  colorCode: 'green',
  noticeEndsOn: null,
  photoUrl: null,
  phone: null,
  diplomaBranch: null,
  parentNames: null,
  interviewNotes: null,
  source: 'manual',
  createdAt: '2026-07-07T09:00:00.000Z',
  addedBy: { id: '01890a5d-ac96-774b-bcce-b30209000004', name: 'Pat Lee' },
  statusEvents: [],
  ...overrides,
});

describe('where the strip ends', () => {
  const graduated: InternStatusEvent = {
    id: '01890a5d-ac96-774b-bcce-b30209000011',
    fromStatus: 'active',
    toStatus: 'graduated',
    reason: 'Done.',
    noticeStartsOn: null,
    noticeEndsOn: null,
    feedbackId: null,
    actor: { id: '01890a5d-ac96-774b-bcce-b30209000004', name: 'Pat Lee' },
    createdAt: '2026-10-08T12:00:00.000Z',
  };

  it('is today while the internship runs, and the final change day after', () => {
    expect(historyEnd(intern({}), '2026-10-24')).toBe('2026-10-24');
    expect(
      historyEnd(intern({ status: 'graduated', statusEvents: [graduated] }), '2026-10-24'),
    ).toBe('2026-10-08');
  });
});

describe('the chart', () => {
  it('shows the latest 4 columns and counts the rest', () => {
    const history = Array.from({ length: 12 }, (_, index) =>
      point('yellow', `2026-07-${String(index + 10)}T12:00:00.000Z`),
    );
    const { columns, hidden } = chartColumns(history);
    expect(columns).toHaveLength(4);
    expect(columns[0]?.at).toBe('2026-07-18T12:00:00.000Z');
    expect(hidden).toBe(8);
    expect(chartColumns(history.slice(0, 3)).hidden).toBe(0);
  });
});
