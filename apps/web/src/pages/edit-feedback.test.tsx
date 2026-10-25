import type {
  BatchDetail,
  FeedbackView,
  InternDetail,
  InternStatusEvent,
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
const internId = '01890a5d-ac96-774b-bcce-b30209000002';
const me = userWith(['mentor']);
const pat = { id: me.id, name: me.name, avatarUrl: null };
const raj = { id: '01890a5d-ac96-774b-bcce-b30209000099', name: 'Rajesh Menon', avatarUrl: null };
const vik = { id: '01890a5d-ac96-774b-bcce-b30209000098', name: 'Vikram Shetty', avatarUrl: null };

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
  id: `01890a5d-ac96-774b-bcce-b302090001${String((next += 1)).padStart(2, '0')}`,
  internId,
  period: '2026-10-01',
  body: 'Text',
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
  ...overrides,
});

const draft = entry({
  author: pat,
  state: 'draft',
  submittedAt: null,
  body: '### Check-ins\nDaily check-ins are **working**.',
  colorCode: 'yellow',
  updatedAt: '2026-10-23T12:00:00.000Z',
});
const noColour = entry({ body: 'Clear improvement this fortnight.' });
const notice = entry({
  author: raj,
  period: '2026-10-01',
  colorCode: 'red',
  previousColorCode: 'borderline_red',
  givesNotice: true,
  state: 'delivered',
  body: '### Summary\nNo improvement.<script>alert(1)</script>',
  submittedAt: '2026-10-08T12:00:00.000Z',
});
const first = entry({
  colorCode: 'borderline_red',
  period: '2026-09-01',
  submittedAt: '2026-09-12T12:00:00.000Z',
});

const feedbackPath = `/batches/${batchId}/interns/${internId}/feedback`;
const profilePath = `/batches/${batchId}/interns/${internId}`;
const internPath = profilePath;

const stub = ({
  profile = intern(),
  list = { status: 200, body: [draft, noColour, notice, first] },
  discard = { status: 204 },
}: Readonly<{ profile?: InternDetail; list?: Reply; discard?: Reply }> = {}) => {
  const replies: Record<string, Reply> = {
    ...signedInWith(['mentor']),
    [`GET /batches/${batchId}`]: { status: 200, body: batch },
    [`GET ${profilePath}`]: { status: 200, body: profile },
    [`GET ${feedbackPath}`]: list,
    [`PUT ${feedbackPath}/${draft.id}`]: { status: 200, body: { ...draft, state: 'submitted' } },
    [`DELETE ${feedbackPath}/${draft.id}`]: discard,
  };
  return { fetchMock: stubApi(replies), replies };
};

const open = async () => {
  const user = userEvent.setup();
  renderApp(profilePath);
  await screen.findByRole('heading', { level: 1, name: 'Ishita Rao' });
  await screen.findByRole('list', { name: 'Timeline' });
  return user;
};

const cards = () => within(screen.getByRole('list', { name: 'Timeline' })).getAllByRole('article');
const card = (index: number) => {
  const found = cards()[index];
  if (!found) throw new Error(`no card ${index}`);
  return within(found);
};

const sent = (fetchMock: ReturnType<typeof stubApi>, method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([input, init]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return {
        path: new URL(url, location.href).pathname.replace(/^\/api/, ''),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      };
    });

/** Pat's own submitted feedback, with no notice. */
const mine = entry({
  author: pat,
  colorCode: 'orange',
  previousColorCode: 'borderline_red',
  body: 'Pairs every day now.',
  submittedAt: '2026-10-20T12:00:00.000Z',
});

const noticeEvent = (feedbackId: string, createdAt = '2026-10-20T12:00:00.000Z') => ({
  ...onboarding,
  id: '01890a5d-ac96-774b-bcce-b30209000020',
  fromStatus: 'active' as const,
  toStatus: 'on_notice' as const,
  reason: 'Notice given in the October 2026 feedback.',
  noticeStartsOn: '2026-10-20',
  noticeEndsOn: '2026-11-20',
  feedbackId,
  actor: pat,
  createdAt,
});

const editPath = (id: string) => `${feedbackPath}/${id}`;

describe('editing submitted feedback (9.8)', () => {
  it("offers Edit only on the viewer's own feedback awaiting delivery", async () => {
    const delivered = entry({
      author: pat,
      state: 'delivered',
      conversationId: '01890a5d-ac96-774b-bcce-b30209000c01',
    });
    stub({ list: { status: 200, body: [draft, mine, delivered, notice] } });
    await open();

    const edits = cards().map(
      (article) => within(article).queryByRole('button', { name: 'Edit' }) !== null,
    );
    expect(edits).toEqual([false, true, false, false]);
  });

  it('has no Edit once the intern is read-only', async () => {
    stub({
      list: { status: 200, body: [mine] },
      profile: intern({
        status: 'withdrawn',
        statusEvents: [
          { ...onboarding, id: '01890a5d-ac96-774b-bcce-b30209000011', toStatus: 'withdrawn' },
          onboarding,
        ],
      }),
    });
    await open();

    expect(card(0).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('marks edited feedback', async () => {
    stub({ list: { status: 200, body: [{ ...mine, editedAt: '2026-10-21T12:00:00.000Z' }] } });
    await open();

    expect(
      card(0).getByText('gave feedback · 20 Oct 2026 · period Oct 2026 · edited'),
    ).toBeInTheDocument();
  });

  it('opens the dialog filled in, and saves the changes with PATCH, refreshing the profile', async () => {
    const { fetchMock, replies } = stub({ list: { status: 200, body: [mine] } });
    replies[`PATCH ${editPath(mine.id)}`] = {
      status: 200,
      body: { ...mine, colorCode: 'red', editedAt: '2026-10-24T10:00:00.000Z' },
    };
    const user = await open();
    const gets = (path: string) =>
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          (init?.method ?? 'GET') === 'GET' &&
          new URL(
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
            location.href,
          ).pathname === `/api${path}`,
      ).length;
    const before = { list: gets(feedbackPath), intern: gets(internPath) };

    await user.click(card(0).getByRole('button', { name: 'Edit' }));

    const dialog = within(screen.getByRole('dialog', { name: 'Edit feedback for Ishita Rao' }));
    expect(
      screen.getByText('Visible to all mentors in Batch 2026. Saving marks it as edited.'),
    ).toBeInTheDocument();
    expect(dialog.getByRole('textbox', { name: 'Feedback' })).toHaveValue('Pairs every day now.');
    expect(dialog.getByRole('radio', { name: 'Orange' })).toBeChecked();
    expect(dialog.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    expect(
      dialog.getByText(
        'Current code: Red. The code follows the newest coloured feedback, so changing an older one leaves it.',
      ),
    ).toBeInTheDocument();

    await user.click(dialog.getByRole('radio', { name: 'Red' }));
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent(fetchMock, 'PATCH')).toEqual([
      {
        path: editPath(mine.id),
        body: {
          period: '2026-10-01',
          body: 'Pairs every day now.',
          colorCode: 'red',
          givesNotice: false,
        },
      },
    ]);
    await vi.waitFor(() => expect(gets(feedbackPath)).toBe(before.list + 1));
    expect(gets(internPath)).toBe(before.intern + 1);
  });

  it('can give notice from the day it is saved', async () => {
    const { fetchMock, replies } = stub({ list: { status: 200, body: [mine] } });
    replies[`PATCH ${editPath(mine.id)}`] = { status: 200, body: { ...mine, givesNotice: true } };
    const user = await open();
    await user.click(card(0).getByRole('button', { name: 'Edit' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit feedback for Ishita Rao' }));
    const toggle = dialog.getByRole('switch', { name: 'Mark as notice' });
    expect(toggle).toHaveAccessibleDescription('Starts a one-month notice when you save.');

    await user.click(toggle);
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() => expect(sent(fetchMock, 'PATCH')).toHaveLength(1));
    expect(sent(fetchMock, 'PATCH')[0]?.body).toMatchObject({
      givesNotice: true,
      colorCode: 'red',
    });
  });

  it('withdraws the notice it gave while that notice runs', async () => {
    const own = { ...mine, givesNotice: true };
    const { fetchMock, replies } = stub({
      list: { status: 200, body: [own] },
      profile: intern({
        status: 'on_notice',
        noticeEndsOn: '2026-11-20',
        statusEvents: [noticeEvent(own.id), onboarding],
      }),
    });
    replies[`PATCH ${editPath(own.id)}`] = { status: 200, body: mine };
    const user = await open();
    await user.click(card(0).getByRole('button', { name: 'Edit' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit feedback for Ishita Rao' }));
    const toggle = dialog.getByRole('switch', { name: 'Mark as notice' });
    expect(toggle).toBeChecked();
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAccessibleDescription(
      'Runs until 20 Nov 2026. Switching it off withdraws it.',
    );

    await user.click(toggle);
    expect(toggle).toHaveAccessibleDescription('Saving withdraws the notice this feedback gave.');
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() => expect(sent(fetchMock, 'PATCH')).toHaveLength(1));
    expect(sent(fetchMock, 'PATCH')[0]?.body).toMatchObject({ givesNotice: false });
  });

  it('locks the switch on, saying why, once the notice was lifted', async () => {
    const own = { ...mine, givesNotice: true };
    const lifted = {
      ...onboarding,
      id: '01890a5d-ac96-774b-bcce-b30209000021',
      fromStatus: 'on_notice' as const,
      toStatus: 'active' as const,
      reason: 'Improved.',
      actor: raj,
      createdAt: '2026-10-22T12:00:00.000Z',
    };
    stub({
      list: { status: 200, body: [own] },
      profile: intern({ statusEvents: [lifted, noticeEvent(own.id), onboarding] }),
    });
    const user = await open();
    await user.click(card(0).getByRole('button', { name: 'Edit' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit feedback for Ishita Rao' }));
    const toggle = dialog.getByRole('switch', { name: 'Mark as notice' });

    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAccessibleDescription(
      "This notice was lifted on 22 Oct 2026, so it can't be withdrawn here.",
    );
  });

  it("shows the API's refusal, keeping the changes", async () => {
    const { replies } = stub({ list: { status: 200, body: [mine] } });
    replies[`PATCH ${editPath(mine.id)}`] = problem(
      409,
      'feedback_delivered',
      "Delivered feedback can't be changed.",
    );
    const user = await open();
    await user.click(card(0).getByRole('button', { name: 'Edit' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit feedback for Ishita Rao' }));
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));

    expect(await dialog.findByText("We couldn't save your changes")).toBeInTheDocument();
    expect(
      dialog.getByText(
        "Your text is still here. Try again in a moment. Delivered feedback can't be changed.",
      ),
    ).toBeInTheDocument();
  });
});
