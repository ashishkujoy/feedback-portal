import type {
  BatchDetail,
  FeedbackView,
  InternDetail,
  MyPending,
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

const me = userWith(['mentor']);
const pat = { id: '01890a5d-ac96-774b-bcce-b30209000096', name: 'Pat Manager', avatarUrl: null };
const sana = { id: '01890a5d-ac96-774b-bcce-b30209000097', name: 'Sana Qureshi', avatarUrl: null };
const vik = { id: '01890a5d-ac96-774b-bcce-b30209000098', name: 'Vikram Shetty', avatarUrl: null };
const mine = { id: me.id, name: me.name, avatarUrl: null };

const batchId = '01890a5d-ac96-774b-bcce-b30209000001';
const batchRef = { id: batchId, name: 'Batch 2026' };
const batch: BatchDetail = {
  ...batchRef,
  startDate: '2026-07-06',
  endDate: '2028-01-06',
  isArchived: false,
  programManager: pat,
  mentorCount: 2,
  interns: { ...noInternCounts, total: 3 },
  mentors: [sana, mine],
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

const detail = (intern: typeof ishita): InternDetail => ({
  ...intern,
  batchId,
  username: intern.name.toLowerCase().replace(' ', '.'),
  email: 'intern@example.com',
  status: 'active',
  colorCode: null,
  noticeEndsOn: null,
  phone: null,
  diplomaBranch: null,
  parentNames: null,
  interviewNotes: null,
  source: 'manual',
  createdAt: '2026-07-07T09:00:00.000Z',
  addedBy: pat,
  statusEvents: [],
});

const draftId = '01890a5d-ac96-774b-bcce-b30209000201';
const awaitingId = '01890a5d-ac96-774b-bcce-b30209000301';
const entry = (overrides: Partial<FeedbackView>): FeedbackView => ({
  id: draftId,
  internId: ishita.id,
  period: '2026-10-01',
  body: '**Daily** check-ins are working.',
  colorCode: null,
  previousColorCode: null,
  givesNotice: false,
  state: 'draft',
  author: mine,
  conversationId: null,
  submittedAt: null,
  createdAt: '2026-10-20T12:00:00.000Z',
  updatedAt: '2026-10-23T12:00:00.000Z',
  editedAt: null,
  deliveredOn: null,
  ...overrides,
});
const draft = entry({});
const awaiting = entry({
  id: awaitingId,
  body: 'Clear improvement this fortnight.',
  state: 'submitted',
  author: vik,
  submittedAt: '2026-10-22T12:00:00.000Z',
  updatedAt: '2026-10-22T12:00:00.000Z',
});

const pending: MyPending = {
  month: '2026-10-01',
  needsFeedback: [
    {
      intern: ishita,
      batch: batchRef,
      colorCode: 'red',
      lastFeedback: { submittedAt: '2026-09-18T10:00:00.000Z', author: sana },
    },
    {
      intern: karan,
      batch: batchRef,
      colorCode: 'yellow',
      lastFeedback: { submittedAt: '2026-09-30T10:00:00.000Z', author: mine },
    },
    { intern: rohan, batch: batchRef, colorCode: null, lastFeedback: null },
  ],
  drafts: [
    {
      feedbackId: draftId,
      intern: ishita,
      batch: batchRef,
      period: '2026-10-01',
      body: draft.body,
      colorCode: 'green',
      updatedAt: draft.updatedAt,
    },
  ],
  toDeliver: [
    {
      feedbackId: '01890a5d-ac96-774b-bcce-b30209000300',
      intern: diya,
      batch: batchRef,
      author: vik,
      submittedAt: '2026-10-24T08:00:00.000Z',
      colorCode: 'borderline_yellow',
    },
    {
      feedbackId: awaitingId,
      intern: ishita,
      batch: batchRef,
      author: vik,
      submittedAt: '2026-10-22T12:00:00.000Z',
      colorCode: null,
    },
  ],
};

const nothing: MyPending = { month: '2026-10-01', needsFeedback: [], drafts: [], toDeliver: [] };

const internPath = (intern: typeof ishita) => `/batches/${batchId}/interns/${intern.id}`;

const stub = ({
  roles = ['mentor'],
  reply = { status: 200, body: pending },
}: Partial<{ roles: [Role, ...Role[]]; reply: Reply }> = {}) =>
  stubApi({
    ...signedInWith(roles),
    'GET /me/pending': reply,
    'GET /batches': { status: 200, body: [] },
    [`GET /batches/${batchId}`]: { status: 200, body: batch },
    [`GET ${internPath(ishita)}`]: { status: 200, body: detail(ishita) },
    [`GET ${internPath(ishita)}/feedback`]: { status: 200, body: [draft, awaiting] },
    [`GET ${internPath(karan)}`]: { status: 200, body: detail(karan) },
    [`GET ${internPath(karan)}/feedback`]: { status: 200, body: [] },
    [`POST ${internPath(karan)}/feedback`]: {
      status: 201,
      body: entry({ internId: karan.id, state: 'submitted', submittedAt: '2026-10-24T10:00:00Z' }),
    },
    [`PUT ${internPath(ishita)}/feedback/${draftId}`]: { status: 200, body: draft },
    [`DELETE ${internPath(ishita)}/feedback/${draftId}`]: { status: 204 },
    [`POST ${internPath(ishita)}/conversations`]: {
      status: 201,
      body: {
        id: '01890a5d-ac96-774b-bcce-b30209000c01',
        internId: ishita.id,
        recordedBy: pat,
        heldOn: '2026-10-24',
        notes: 'Delivered in the 1:1.',
        createdAt: '2026-10-24T10:00:00.000Z',
        updatedAt: '2026-10-24T10:00:00.000Z',
        editedAt: null,
        feedback: { id: awaitingId, author: vik, submittedAt: awaiting.submittedAt },
      },
    },
  });

const open = async (search = '') => {
  const user = userEvent.setup();
  renderApp(`/pending${search}`);
  await screen.findByRole('heading', { level: 1, name: 'My pending' });
  return user;
};

const urlOf = (input: Parameters<typeof fetch>[0]) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const pendingLoads = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([input]) => urlOf(input).endsWith('/me/pending')).length;

const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent);
const bodyRows = () => screen.getAllByRole('row').slice(1);
const navLink = async (name: string) =>
  within(await screen.findByRole('navigation', { name: 'Main' })).findByRole('link', { name });

describe('My pending in the sidebar (11.2)', () => {
  it('counts Needs feedback for a mentor', async () => {
    stub();
    renderApp('/batches');

    expect(await navLink('My pending (3)')).toHaveAttribute('href', '/pending');
  });

  it('counts To deliver for a programme manager', async () => {
    stub({ roles: ['program_manager', 'mentor'] });
    renderApp('/batches');

    expect(await navLink('My pending (2)')).toBeInTheDocument();
  });

  it('shows no badge at 0', async () => {
    const fetchMock = stub({ reply: { status: 200, body: nothing } });
    renderApp('/batches');
    await vi.waitFor(() => expect(pendingLoads(fetchMock)).toBe(1));

    const link = await navLink('My pending');
    expect(link.textContent).toBe('My pending');
  });
});

describe('the My pending page (11.2)', () => {
  it('gives a mentor Needs feedback and Drafts, Needs feedback first', async () => {
    stub();
    await open();

    expect(
      await screen.findByText(
        'Interns in your batches with no feedback for October 2026, and your drafts.',
      ),
    ).toBeInTheDocument();
    expect(tabNames()).toEqual(['Needs feedback3', 'Drafts1']);
    expect(screen.getByRole('tab', { name: /Needs feedback/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('gives a PM To deliver first, and a mentor no To deliver from a link', async () => {
    stub({ roles: ['program_manager'] });
    await open();

    expect(
      await screen.findByText(
        'Feedback waiting for you to deliver, and interns without feedback this month.',
      ),
    ).toBeInTheDocument();
    expect(tabNames()).toEqual(['To deliver2', 'Needs feedback3', 'Drafts1']);
    expect(screen.getByRole('tab', { name: /To deliver/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('opens the role’s first tab for a tab it doesn’t have', async () => {
    stub();
    await open('?tab=deliver');

    expect(screen.getByRole('tab', { name: /Needs feedback/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('lists interns needing your feedback with their last feedback', async () => {
    stub();
    await open();
    await screen.findByRole('table', { name: 'Interns needing your feedback' });

    expect(bodyRows().map((row) => row.textContent)).toEqual([
      'IRIshita RaoBatch 2026Red18 Sep 2026 · Sana QureshiGive feedback',
      'KMKaran MehtaBatch 2026Yellow30 Sep 2026 · youGive feedback',
      'RDRohan DasBatch 2026No colourNo feedback yetGive feedback',
    ]);
    expect(screen.getByRole('link', { name: 'Ishita Rao' })).toHaveAttribute(
      'href',
      `/batches/${batchId}/interns/${ishita.id}`,
    );
    expect(screen.getByText('3 interns')).toBeInTheDocument();
  });

  it('gives feedback from a row, then refreshes the list', async () => {
    const fetchMock = stub();
    const user = await open();
    await screen.findByRole('table', { name: 'Interns needing your feedback' });
    const loads = pendingLoads(fetchMock);

    await user.click(screen.getByRole('button', { name: 'Give feedback to Karan Mehta' }));
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Give feedback to Karan Mehta' }),
    );
    expect(dialog.getByRole('textbox', { name: 'Feedback' })).toHaveValue('');
    await user.type(dialog.getByRole('textbox', { name: 'Feedback' }), 'Good week.');
    await user.click(dialog.getByRole('button', { name: 'Submit feedback' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => init?.method === 'POST' && urlOf(input).endsWith('/feedback'),
      ),
    ).toBe(true);
    expect(pendingLoads(fetchMock)).toBe(loads + 1);
  });

  it('carries on with your draft when giving feedback to its intern (decision 5)', async () => {
    stub();
    const user = await open();
    await screen.findByRole('table', { name: 'Interns needing your feedback' });

    await user.click(screen.getByRole('button', { name: 'Give feedback to Ishita Rao' }));
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Give feedback to Ishita Rao' }),
    );

    expect(dialog.getByRole('textbox', { name: 'Feedback' })).toHaveValue(draft.body);
  });

  it('says you’re up to date when no one needs your feedback', async () => {
    stub({ reply: { status: 200, body: nothing } });
    await open();

    expect(await screen.findByText("You're up to date")).toBeInTheDocument();
    expect(
      screen.getByText('Every intern in your batches has feedback from you for October 2026.'),
    ).toBeInTheDocument();
  });

  it('shows your drafts, to continue or discard', async () => {
    const fetchMock = stub();
    const user = await open('?tab=drafts');
    const card = within(await within(screen.getByRole('tabpanel')).findByRole('listitem'));

    expect(card.getByText('Batch 2026 · period Oct 2026 · edited 23 Oct')).toBeInTheDocument();
    expect(card.getByText('Daily check-ins are working.')).toBeInTheDocument();
    expect(card.getByText('Green')).toBeInTheDocument();

    await user.click(card.getByRole('button', { name: 'Continue the draft for Ishita Rao' }));
    const editing = within(
      await screen.findByRole('dialog', { name: 'Give feedback to Ishita Rao' }),
    );
    expect(editing.getByRole('textbox', { name: 'Feedback' })).toHaveValue(draft.body);
    await user.click(editing.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const loads = pendingLoads(fetchMock);
    await user.click(card.getByRole('button', { name: 'Discard the draft for Ishita Rao' }));
    const confirm = within(await screen.findByRole('dialog', { name: 'Discard this draft?' }));
    await user.click(confirm.getByRole('button', { name: 'Discard draft' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      `/api${internPath(ishita)}/feedback/${draftId}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(pendingLoads(fetchMock)).toBe(loads + 1);
  });

  it('says when there are no drafts', async () => {
    stub({ reply: { status: 200, body: nothing } });
    await open('?tab=drafts');

    expect(await screen.findByText('No drafts.')).toBeInTheDocument();
  });

  it('lists the feedback for a PM to deliver, and records a conversation from a row', async () => {
    const fetchMock = stub({ roles: ['program_manager'] });
    const user = await open();
    await screen.findByRole('table', { name: 'Feedback waiting to be delivered' });

    expect(bodyRows().map((row) => row.textContent)).toEqual([
      'DRDiya ReddyVikram Shetty24 Oct 2026Borderline YellowtodayRecord conversation',
      'IRIshita RaoVikram Shetty22 Oct 2026No colour2 daysRecord conversation',
    ]);
    const loads = pendingLoads(fetchMock);
    await user.click(
      screen.getByRole('button', {
        name: 'Record conversation for Ishita Rao, feedback by Vikram Shetty',
      }),
    );
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
    expect(pendingLoads(fetchMock)).toBe(loads + 1);
  });

  it('says when nothing waits to be delivered', async () => {
    stub({ roles: ['program_manager'], reply: { status: 200, body: nothing } });
    await open();

    expect(await screen.findByText('No feedback is waiting to be delivered.')).toBeInTheDocument();
  });

  it('shows a callout if the lists fail to load', async () => {
    stub({ reply: problem(403, 'forbidden', 'Not allowed.') });
    await open();

    expect(await screen.findByText("We couldn't load your pending work")).toBeInTheDocument();
    expect(screen.getByText('Not allowed.')).toBeInTheDocument();
  });

  it('shows Skeletons while the lists load', async () => {
    const answered = stub();
    // The lists never arrive; everything else is answered as usual.
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((input, init) =>
        urlOf(input).endsWith('/me/pending')
          ? new Promise<Response>(() => undefined)
          : answered(input, init),
      ),
    );
    await open();

    expect(screen.getByLabelText('Loading your pending work')).toHaveAttribute('aria-busy', 'true');
  });
});
