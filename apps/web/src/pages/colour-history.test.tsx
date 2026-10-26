import type {
  BatchDetail,
  FeedbackView,
  InternDetail,
  InternStatusEvent,
} from '@feedback-portal/contracts';
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noInternCounts } from '../test/fixtures.ts';
import { renderApp } from '../test/render-app.tsx';
import { problem, type Reply, signedInWith, stubApi, userWith } from '../test/stub-api.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const batchId = '01890a5d-ac96-774b-bcce-b30209000001';
const internId = '01890a5d-ac96-774b-bcce-b30209000002';
const me = userWith(['mentor']);
const pat = { id: me.id, name: me.name, avatarUrl: null };
const raj = { id: '01890a5d-ac96-774b-bcce-b30209000099', name: 'Rajesh Menon', avatarUrl: null };

const batch: BatchDetail = {
  id: batchId,
  name: 'Batch 2026',
  startDate: '2026-07-06',
  endDate: '2028-01-06',
  isArchived: false,
  programManager: raj,
  mentorCount: 1,
  interns: { ...noInternCounts, total: 1 },
  mentors: [pat],
  members: [],
};

const onboarding: InternStatusEvent = {
  id: '01890a5d-ac96-774b-bcce-b30209000010',
  fromStatus: null,
  toStatus: 'active',
  reason: null,
  noticeStartsOn: null,
  noticeEndsOn: null,
  feedbackId: null,
  actor: raj,
  createdAt: '2026-07-07T09:00:00.000Z',
};

const intern = (overrides: Partial<InternDetail> = {}): InternDetail => ({
  id: internId,
  batchId,
  username: 'ishita.rao',
  name: 'Ishita Rao',
  email: 'ishita@example.com',
  status: 'active',
  colorCode: 'red',
  noticeEndsOn: null,
  photoUrl: null,
  phone: null,
  diplomaBranch: null,
  parentNames: null,
  interviewNotes: null,
  source: 'manual',
  createdAt: '2026-07-07T09:00:00.000Z',
  addedBy: raj,
  statusEvents: [onboarding],
  ...overrides,
});

let next = 0;
const entry = (overrides: Partial<FeedbackView> = {}): FeedbackView => ({
  id: `01890a5d-ac96-774b-bcce-b302090002${String((next += 1)).padStart(2, '0')}`,
  internId,
  period: '2026-10-01',
  body: 'Text',
  colorCode: null,
  previousColorCode: null,
  givesNotice: false,
  state: 'submitted',
  author: raj,
  conversationId: null,
  submittedAt: '2026-10-22T12:00:00.000Z',
  createdAt: '2026-10-22T12:00:00.000Z',
  updatedAt: '2026-10-22T12:00:00.000Z',
  editedAt: null,
  deliveredOn: null,
  ...overrides,
});

const coloured = (code: FeedbackView['colorCode'], submittedAt: string) =>
  entry({ colorCode: code, submittedAt });

/** v2 Ishita's history: Yellow, Orange, Borderline Red, Red, then Red confirmed. */
const ishita = [
  entry({ state: 'draft', author: pat, colorCode: 'green', submittedAt: null }),
  entry({ colorCode: null }),
  coloured('red', '2026-10-20T12:00:00.000Z'),
  coloured('red', '2026-10-08T12:00:00.000Z'),
  coloured('borderline_red', '2026-09-12T12:00:00.000Z'),
  coloured('orange', '2026-08-18T12:00:00.000Z'),
  coloured('yellow', '2026-07-24T12:00:00.000Z'),
];

const profilePath = `/batches/${batchId}/interns/${internId}`;

const stub = ({
  profile = intern(),
  list = { status: 200, body: ishita },
}: Readonly<{ profile?: InternDetail; list?: Reply }> = {}) =>
  stubApi({
    ...signedInWith(['mentor']),
    [`GET /batches/${batchId}`]: { status: 200, body: batch },
    [`GET ${profilePath}`]: { status: 200, body: profile },
    [`GET ${profilePath}/feedback`]: list,
    [`GET ${profilePath}/conversations`]: { status: 200, body: [] },
  });

const open = async () => {
  renderApp(profilePath);
  await screen.findByRole('heading', { level: 1, name: 'Ishita Rao' });
};

const historyCard = async () =>
  within(await screen.findByRole('region', { name: 'Colour history' }));

/** The chart's dots, as the row each sits in, left to right. */
const dotRows = (card: ReturnType<typeof within>) => {
  const chart = card.getByTestId('colour-chart');
  const rows = [...chart.querySelectorAll('[data-row]')];
  const columns = rows[0]?.children.length ?? 0;
  return Array.from({ length: columns - 1 }, (_, column) =>
    rows
      .find((row) => row.children[column + 1]?.querySelector('[data-testid="colour-dot"]'))
      ?.getAttribute('data-row'),
  );
};

const stripCodes = (card: ReturnType<typeof within>) =>
  [...card.getByTestId('colour-strip').children].map((segment) => ({
    code: segment.getAttribute('data-code'),
    width: segment.getAttribute('style'),
  }));

describe('the colour history', () => {
  it("puts a dot per coloured feedback in its colour's row, with its day", async () => {
    stub();
    await open();
    const card = await historyCard();

    // The latest 4 of the 5 (decision 3); Red given again has its own column.
    expect(dotRows(card)).toEqual(['orange', 'borderline_red', 'red', 'red']);
    for (const label of ['Green', 'Yellow', 'Borderline Yellow', 'Orange', 'Borderline Red'])
      expect(card.getByText(label)).toBeInTheDocument();
    expect(card.getByText('18 Aug')).toHaveAttribute('title', '18 Aug 2026');
    expect(card.getByText('20 Oct')).toBeInTheDocument();
    expect(card.queryByText('24 Jul')).not.toBeInTheDocument();
    expect(card.getByText('Latest 4 of 5.')).toBeInTheDocument();
  });

  it('draws the strip by days, from the batch start to today', async () => {
    stub();
    await open();
    const card = await historyCard();

    // 6 Jul → 24 Oct is 110 days: none 18, yellow 25, orange 25, borderline red 26, red 16
    // (the second Red merges into the first).
    expect(stripCodes(card)).toEqual([
      { code: 'none', width: `width: ${(18 / 110) * 100}%;` },
      { code: 'yellow', width: `width: ${(25 / 110) * 100}%;` },
      { code: 'orange', width: `width: ${(25 / 110) * 100}%;` },
      { code: 'borderline_red', width: `width: ${(26 / 110) * 100}%;` },
      { code: 'red', width: `width: ${(16 / 110) * 100}%;` },
    ]);
    expect(card.getByText('6 Jul')).toBeInTheDocument();
    expect(card.getByText('Today')).toBeInTheDocument();
  });

  it('lists every colour and day for screen readers', async () => {
    stub();
    await open();
    const card = await historyCard();

    expect(card.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Yellow, 24 Jul 2026',
      'Orange, 18 Aug 2026',
      'Borderline Red, 12 Sep 2026',
      'Red, 8 Oct 2026',
      'Red, 20 Oct 2026',
    ]);
  });

  it('ends on the day a graduated intern graduated', async () => {
    const graduated: InternStatusEvent = {
      ...onboarding,
      id: '01890a5d-ac96-774b-bcce-b30209000011',
      fromStatus: 'active',
      toStatus: 'graduated',
      reason: 'Done.',
      createdAt: '2026-10-21T12:00:00.000Z',
    };
    stub({ profile: intern({ status: 'graduated', statusEvents: [graduated, onboarding] }) });
    await open();
    const card = await historyCard();

    expect(card.getByText('21 Oct')).toBeInTheDocument();
    expect(card.queryByText('Today')).not.toBeInTheDocument();
  });

  it('shows the latest 4 columns of many', async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      coloured(
        index % 2 === 0 ? 'yellow' : 'orange',
        `2026-08-${String(index + 10)}T12:00:00.000Z`,
      ),
    );
    stub({ list: { status: 200, body: many } });
    await open();
    const card = await historyCard();

    expect(dotRows(card)).toHaveLength(4);
    expect(card.getByText('18 Aug')).toBeInTheDocument();
    expect(card.queryByText('17 Aug')).not.toBeInTheDocument();
    expect(card.getByText('Latest 4 of 12.')).toBeInTheDocument();
    expect(card.getAllByRole('listitem')).toHaveLength(12);
  });

  it('is left out without coloured feedback', async () => {
    stub({
      profile: intern({ colorCode: null }),
      list: { status: 200, body: [entry({ colorCode: null })] },
    });
    await open();
    await screen.findByRole('list', { name: 'Timeline' });
    expect(screen.queryByRole('region', { name: 'Colour history' })).not.toBeInTheDocument();
  });

  it('is left out when the feedback fails to load', async () => {
    stub({ list: problem(403, 'forbidden', 'Not allowed.') });
    await open();
    await screen.findByText("We couldn't load the feedback");
    expect(screen.queryByRole('region', { name: 'Colour history' })).not.toBeInTheDocument();
  });
});
