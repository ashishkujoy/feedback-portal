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

describe('the feedback timeline', () => {
  it("lists the viewer's draft first, then feedback newest first, in v2's cards", async () => {
    stub();
    await open();

    expect(cards().map((article) => article.getAttribute('aria-label'))).toEqual([
      'Your draft',
      'Feedback from Vikram Shetty',
      'Feedback from Rajesh Menon',
      'Feedback from Vikram Shetty',
    ]);
    expect(card(1).getByText('gave feedback · 22 Oct 2026 · period Oct 2026')).toBeInTheDocument();
    expect(card(1).getByText('Awaiting delivery')).toHaveAttribute('data-type', 'info');
    expect(card(2).getByText('Delivered')).toHaveAttribute('data-type', 'success');
    expect(card(3).getByText('gave feedback · 12 Sep 2026 · period Sep 2026')).toBeInTheDocument();
  });

  it('shows colour changes and flags notice', async () => {
    stub();
    await open();

    expect(card(1).getByText('No colour')).toBeInTheDocument();
    expect(card(1).getByText('Colour code unchanged')).toBeInTheDocument();
    expect(card(2).getByText('Borderline Red')).toBeInTheDocument();
    expect(card(2).getByText('Red')).toBeInTheDocument();
    expect(card(2).getByText('to')).toHaveClass('sr-only');
    expect(card(2).getByText('Notice')).toHaveAttribute('data-type', 'error');
    // A first colour has no previous chip.
    expect(card(3).getAllByText(/Red|Yellow|Green|Orange/)).toHaveLength(1);
    expect(card(3).queryByText('Colour code unchanged')).not.toBeInTheDocument();
    for (const index of [1, 3]) expect(card(index).queryByText('Notice')).not.toBeInTheDocument();
  });

  it('renders the text as sanitized Markdown', async () => {
    stub();
    await open();

    expect(card(2).getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
    expect(cards()[2]?.querySelector('script')).toBeNull();
  });

  it('dates the colour in the side panel from the latest coloured feedback', async () => {
    stub();
    await open();

    expect(screen.getByText('From the latest coloured feedback, 8 Oct 2026.')).toBeInTheDocument();
  });

  it('shows the empty state when there is no feedback, and an error when it fails', async () => {
    stub({ list: { status: 200, body: [] } });
    renderApp(profilePath);
    expect(await screen.findByText('No feedback yet')).toBeInTheDocument();
    expect(screen.getByText('From the latest coloured feedback.')).toBeInTheDocument();
  });

  it("says when the feedback can't load", async () => {
    stub({ list: problem(403, 'forbidden', 'You can no longer see this batch.') });
    renderApp(profilePath);
    expect(await screen.findByText("We couldn't load the feedback")).toBeInTheDocument();
    expect(screen.getByText('You can no longer see this batch.')).toBeInTheDocument();
  });
});

describe('a draft', () => {
  it('shows who can see it, when it was edited, and an excerpt', async () => {
    stub();
    await open();

    expect(
      card(0).getByText('· only you can see this · edited 23 Oct', { exact: false }),
    ).toBeInTheDocument();
    expect(card(0).getByText('Draft')).toHaveAttribute('data-type', 'neutral');
    expect(card(0).getByText('Check-ins Daily check-ins are working.')).toBeInTheDocument();
  });

  it('opens in the Give feedback dialog and is submitted from there', async () => {
    const { fetchMock } = stub();
    const user = await open();

    await user.click(card(0).getByRole('button', { name: 'Continue editing' }));

    const dialog = within(screen.getByRole('dialog', { name: 'Give feedback to Ishita Rao' }));
    expect(dialog.getByRole('textbox', { name: 'Feedback' })).toHaveValue(draft.body);
    expect(dialog.getByRole('radio', { name: 'Yellow' })).toBeChecked();

    await user.click(dialog.getByRole('button', { name: 'Submit feedback' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent(fetchMock, 'PUT')).toEqual([
      {
        path: `${feedbackPath}/${draft.id}`,
        body: {
          period: '2026-10-01',
          body: draft.body,
          colorCode: 'yellow',
          givesNotice: false,
          submit: true,
        },
      },
    ]);
  });

  it('is discarded after A26 asks, and leaves the timeline', async () => {
    const { fetchMock, replies } = stub();
    const user = await open();

    await user.click(card(0).getByRole('button', { name: 'Discard' }));

    const dialog = within(screen.getByRole('dialog', { name: 'Discard this draft?' }));
    expect(
      screen.getByText(
        'Your draft feedback for Ishita Rao (October 2026) is deleted. Only you could see it.',
      ),
    ).toBeInTheDocument();
    expect(sent(fetchMock, 'DELETE')).toEqual([]);

    replies[`GET ${feedbackPath}`] = { status: 200, body: [noColour, notice, first] };
    await user.click(dialog.getByRole('button', { name: 'Discard draft' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent(fetchMock, 'DELETE')).toEqual([
      { path: `${feedbackPath}/${draft.id}`, body: undefined },
    ]);
    await vi.waitFor(() => expect(cards()).toHaveLength(3));
    expect(screen.queryByRole('article', { name: 'Your draft' })).not.toBeInTheDocument();
  });

  it('stays on Cancel', async () => {
    const { fetchMock } = stub();
    const user = await open();

    await user.click(card(0).getByRole('button', { name: 'Discard' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sent(fetchMock, 'DELETE')).toEqual([]);
    expect(cards()).toHaveLength(4);
  });

  it("shows the API's refusal to discard", async () => {
    stub({ discard: problem(409, 'batch_archived', 'This batch is archived.') });
    const user = await open();

    await user.click(card(0).getByRole('button', { name: 'Discard' }));
    await user.click(screen.getByRole('button', { name: 'Discard draft' }));

    expect(await screen.findByText("We couldn't discard the draft")).toBeInTheDocument();
    expect(screen.getByText('This batch is archived.')).toBeInTheDocument();
  });

  it('has no buttons once the intern is read-only (9.6 decision 3)', async () => {
    stub({
      profile: intern({
        status: 'withdrawn',
        statusEvents: [
          { ...onboarding, id: '01890a5d-ac96-774b-bcce-b30209000011', toStatus: 'withdrawn' },
          onboarding,
        ],
      }),
    });
    await open();

    expect(card(0).getByText('Draft')).toBeInTheDocument();
    expect(card(0).queryAllByRole('button')).toEqual([]);
  });
});
