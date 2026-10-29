import type {
  BatchDetail,
  BatchOverview,
  FeedbackView,
  InternDetail,
  Role,
} from '@feedback-portal/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
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
const me = userWith(['program_manager']);
const pm = { id: me.id, name: me.name, avatarUrl: null };
const anjali = {
  id: '01890a5d-ac96-774b-bcce-b30209000097',
  name: 'Anjali Deshpande',
  avatarUrl: null,
};
const vik = { id: '01890a5d-ac96-774b-bcce-b30209000098', name: 'Vikram Shetty', avatarUrl: null };
const someoneElse = '01890a5d-ac96-774b-bcce-b30209000099';

const batch: BatchDetail = {
  id: batchId,
  name: 'Batch 2026',
  startDate: '2026-07-06',
  endDate: '2028-01-06',
  isArchived: false,
  programManager: pm,
  mentorCount: 2,
  interns: { ...noInternCounts, total: 5 },
  mentors: [anjali, vik],
  members: [],
};

const ref = (n: number, name: string) => ({
  id: `01890a5d-ac96-774b-bcce-b302090001${String(n).padStart(2, '0')}`,
  name,
  photoUrl: null,
});
const ishita = ref(1, 'Ishita Rao');
const karan = ref(2, 'Karan Mehta');
const rohan = ref(3, 'Rohan Das');
const diya = ref(4, 'Diya Reddy');

const awaitingId = '01890a5d-ac96-774b-bcce-b30209000301';
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
  onNotice: [
    { intern: rohan, noticeStartsOn: '2026-09-20', noticeEndsOn: '2026-10-20', issuedBy: anjali },
    { intern: karan, noticeStartsOn: '2026-09-30', noticeEndsOn: '2026-10-30', issuedBy: vik },
    { intern: ishita, noticeStartsOn: '2026-10-08', noticeEndsOn: '2026-11-08', issuedBy: anjali },
  ],
  toDeliver: [
    {
      feedbackId: '01890a5d-ac96-774b-bcce-b30209000300',
      intern: diya,
      author: vik,
      submittedAt: '2026-10-24T08:00:00.000Z',
      colorCode: 'borderline_yellow',
    },
    {
      feedbackId: awaitingId,
      intern: ishita,
      author: vik,
      submittedAt: '2026-10-22T12:00:00.000Z',
      colorCode: null,
    },
  ],
};

const ishitaDetail: InternDetail = {
  id: ishita.id,
  batchId,
  username: 'ishita.rao',
  name: 'Ishita Rao',
  email: 'ishita@example.com',
  status: 'on_notice',
  colorCode: 'red',
  noticeEndsOn: '2026-11-08',
  photoUrl: null,
  phone: null,
  diplomaBranch: null,
  parentNames: null,
  interviewNotes: null,
  source: 'manual',
  createdAt: '2026-07-07T09:00:00.000Z',
  addedBy: pm,
  statusEvents: [],
};
const awaiting: FeedbackView = {
  id: awaitingId,
  internId: ishita.id,
  period: '2026-10-01',
  body: 'Clear improvement this fortnight.',
  colorCode: null,
  previousColorCode: null,
  givesNotice: false,
  state: 'submitted',
  author: vik,
  conversationId: null,
  submittedAt: '2026-10-22T12:00:00.000Z',
  createdAt: '2026-10-22T12:00:00.000Z',
  updatedAt: '2026-10-22T12:00:00.000Z',
  editedAt: null,
  deliveredOn: null,
};

const overviewPath = `/batches/${batchId}/overview`;
const internPath = `/batches/${batchId}/interns/${ishita.id}`;

const stub = ({
  roles = ['program_manager'],
  viewer = {},
  shown = batch,
  reply = { status: 200, body: overview },
}: Partial<{
  roles: [Role, ...Role[]];
  viewer: Parameters<typeof signedInWith>[1];
  shown: BatchDetail;
  reply: Reply;
}> = {}) =>
  stubApi({
    ...signedInWith(roles, viewer),
    [`GET /batches/${batchId}`]: { status: 200, body: shown },
    [`GET /batches/${batchId}/interns`]: { status: 200, body: [] },
    [`GET ${overviewPath}`]: reply,
    [`GET ${internPath}`]: { status: 200, body: ishitaDetail },
    [`GET ${internPath}/feedback`]: { status: 200, body: [awaiting] },
    [`POST ${internPath}/conversations`]: {
      status: 201,
      body: {
        id: '01890a5d-ac96-774b-bcce-b30209000c01',
        internId: ishita.id,
        recordedBy: pm,
        heldOn: '2026-10-24',
        notes: 'Delivered in the 1:1.',
        createdAt: '2026-10-24T10:00:00.000Z',
        updatedAt: '2026-10-24T10:00:00.000Z',
        editedAt: null,
        feedback: { id: awaitingId, author: vik, submittedAt: awaiting.submittedAt },
      },
    },
  });

const open = async (search = '?tab=overview') => {
  const user = userEvent.setup();
  renderApp(`/batches/${batchId}${search}`);
  await screen.findByRole('heading', { level: 1, name: 'Batch 2026' });
  return user;
};

const card = (name: string) => within(screen.getByRole('region', { name }));
const rows = (name: string) => card(name).getAllByRole('listitem');

const overviewLoads = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([input]) =>
    (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).endsWith(
      '/overview',
    ),
  ).length;

describe('the Overview tab (11.1)', () => {
  it('is listed first for the batch’s managers, with Interns still the default', async () => {
    stub();
    const user = await open('');

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview',
      'Interns5',
      'Mentors2',
    ]);
    expect(screen.getByRole('tab', { name: /Interns/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Overview' }));

    expect(await screen.findByRole('region', { name: 'Colour distribution' })).toBeInTheDocument();
  });

  it('is for an admin too, without Record conversation', async () => {
    stub({ roles: ['admin'], viewer: { id: someoneElse } });
    await open();

    expect(await screen.findByRole('region', { name: 'Feedback to deliver' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record conversation' })).not.toBeInTheDocument();
  });

  it('isn’t a mentor’s: no tab, and a link to it opens the roster', async () => {
    stub({ roles: ['mentor'], viewer: { id: vik.id, name: vik.name } });
    await open();

    expect(screen.queryByRole('tab', { name: 'Overview' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Interns/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: 'Colour distribution' })).not.toBeInTheDocument();
  });

  it('shows the colour distribution of current interns', async () => {
    stub();
    await open();
    const colours = await screen.findByRole('region', { name: 'Colour distribution' });

    expect(
      within(colours).getByText(
        '65 current interns, including 4 on notice. Excludes terminated and withdrawn.',
      ),
    ).toBeInTheDocument();
    expect(rows('Colour distribution').map((row) => row.textContent)).toEqual([
      'Green1218%',
      'Yellow1828%',
      'Borderline Yellow812%',
      'Orange69%',
      'Borderline Red58%',
      'Red46%',
      'No colour1218%',
    ]);
  });

  it('lists who is on notice: the end, who issued it, the days left or a decision needed', async () => {
    stub();
    await open();
    await screen.findByRole('region', { name: 'On notice' });

    const [ended, soon, later] = rows('On notice').map((row) => within(row));
    if (!ended || !soon || !later) throw new Error('three rows expected');
    expect(ended.getByRole('link', { name: 'Rohan Das' })).toHaveAttribute(
      'href',
      `/batches/${batchId}/interns/${rohan.id}`,
    );
    expect(ended.getByText('Ends 20 Oct 2026 · issued by Anjali Deshpande')).toBeInTheDocument();
    expect(ended.getByText('Decision needed')).toHaveAttribute('data-type', 'warning');
    expect(soon.getByText('6 days left')).toHaveClass('text-runtime-red-700');
    expect(later.getByText('15 days left')).toHaveClass('text-foreground');
  });

  it('lists the feedback waiting to be delivered, newest first', async () => {
    stub();
    await open();
    await screen.findByRole('region', { name: 'Feedback to deliver' });

    expect(card('Feedback to deliver').getByText('2 submitted')).toBeInTheDocument();
    const [today, older] = rows('Feedback to deliver').map((row) => within(row));
    if (!today || !older) throw new Error('two rows expected');
    expect(today.getByText('From Vikram Shetty · 24 Oct 2026 · waiting today')).toBeInTheDocument();
    expect(today.getByText('Borderline Yellow')).toBeInTheDocument();
    expect(
      older.getByText('From Vikram Shetty · 22 Oct 2026 · waiting 2 days'),
    ).toBeInTheDocument();
    expect(older.getByText('No colour')).toBeInTheDocument();
  });

  it('lets the PM record a conversation from a row, then refreshes', async () => {
    const fetchMock = stub();
    const user = await open();
    await screen.findByRole('region', { name: 'Feedback to deliver' });
    const loads = overviewLoads(fetchMock);

    const [, ishitaRow] = rows('Feedback to deliver');
    if (!ishitaRow) throw new Error('row expected');
    await user.click(within(ishitaRow).getByRole('button', { name: 'Record conversation' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Record conversation' }));
    expect(dialog.getByRole('radio', { name: /Vikram Shetty/ })).toBeChecked();
    await user.type(
      dialog.getByRole('textbox', { name: /Conversation notes/ }),
      'Delivered in the 1:1.',
    );
    await user.click(dialog.getByRole('button', { name: 'Save conversation' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const posted = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    const body = posted?.[1]?.body;
    expect(typeof body === 'string' ? JSON.parse(body) : body).toMatchObject({
      feedbackId: awaitingId,
    });
    expect(overviewLoads(fetchMock)).toBe(loads + 1);
  });

  it('gives no Record conversation in an archived batch', async () => {
    stub({ shown: { ...batch, isArchived: true } });
    await open();
    await screen.findByRole('region', { name: 'Feedback to deliver' });

    expect(screen.queryByRole('button', { name: 'Record conversation' })).not.toBeInTheDocument();
  });

  it('says when there is nothing to show', async () => {
    stub({
      reply: {
        status: 200,
        body: {
          ...overview,
          current: 0,
          onNoticeCount: 0,
          colours: {
            green: 0,
            yellow: 0,
            borderline_yellow: 0,
            orange: 0,
            borderline_red: 0,
            red: 0,
            none: 0,
          },
          onNotice: [],
          toDeliver: [],
        },
      },
    });
    await open();

    expect(await screen.findByText('No current interns yet.')).toBeInTheDocument();
    expect(screen.getByText('No one is on notice.')).toBeInTheDocument();
    expect(screen.getByText('No feedback is waiting to be delivered.')).toBeInTheDocument();
    expect(card('Feedback to deliver').getByText('0 submitted')).toBeInTheDocument();
  });

  it('says when the overview fails to load', async () => {
    stub({ reply: problem(403, 'forbidden', 'Not allowed.') });
    await open();

    expect(await screen.findByText("We couldn't load the overview")).toBeInTheDocument();
  });
});
