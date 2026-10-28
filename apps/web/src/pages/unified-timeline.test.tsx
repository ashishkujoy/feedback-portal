import type {
  BatchDetail,
  CommentView,
  FeedbackView,
  InternDetail,
  InternStatusEvent,
  Role,
} from '@feedback-portal/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noInternCounts } from '../test/fixtures.ts';
import { renderApp } from '../test/render-app.tsx';
import { signedInWith, stubApi } from '../test/stub-api.ts';

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
const pm = { id: '01890a5d-ac96-774b-bcce-b30209000096', name: 'Rajesh Menon', avatarUrl: null };
const anjali = {
  id: '01890a5d-ac96-774b-bcce-b30209000097',
  name: 'Anjali Deshpande',
  avatarUrl: null,
};
const vik = { id: '01890a5d-ac96-774b-bcce-b30209000098', name: 'Vikram Shetty', avatarUrl: null };
const joel = {
  id: '01890a5d-ac96-774b-bcce-b30209000099',
  name: 'Joel Fernandes',
  avatarUrl: null,
};

const batch: BatchDetail = {
  id: batchId,
  name: 'Batch 2026',
  startDate: '2026-07-06',
  endDate: '2028-01-06',
  isArchived: false,
  programManager: pm,
  mentorCount: 3,
  interns: { ...noInternCounts, total: 1 },
  mentors: [anjali, vik, joel],
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
  actor: pm,
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
  addedBy: pm,
  statusEvents: [onboarding],
  ...overrides,
});

const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}T12:00:00.000Z`;
const feedbackOn = (n: number): FeedbackView => ({
  id: `01890a5d-ac96-774b-bcce-b302090003${String(n).padStart(2, '0')}`,
  internId,
  period: '2026-10-01',
  body: `Entry for day ${n}.`,
  colorCode: null,
  previousColorCode: null,
  givesNotice: n === 12,
  state: 'submitted',
  author: vik,
  conversationId: null,
  submittedAt: day(n),
  createdAt: day(n),
  updatedAt: day(n),
  editedAt: null,
  deliveredOn: null,
});
// Twelve entries, 1 to 12 Oct; the last gave notice.
const feedback = Array.from({ length: 12 }, (_, index) => feedbackOn(index + 1));
const [first] = feedback;
const last = feedback.at(-1);
if (!first || !last) throw new Error('no feedback');

const notice: InternStatusEvent = {
  id: '01890a5d-ac96-774b-bcce-b30209000012',
  fromStatus: 'active',
  toStatus: 'on_notice',
  reason: 'Notice given in the October 2026 feedback.',
  noticeStartsOn: '2026-10-12',
  noticeEndsOn: '2026-11-12',
  feedbackId: last.id,
  actor: vik,
  createdAt: day(12),
};
const lifted: InternStatusEvent = {
  ...notice,
  id: '01890a5d-ac96-774b-bcce-b30209000013',
  fromStatus: 'on_notice',
  toStatus: 'active',
  reason: 'Back on **track** after the daily check-ins.',
  noticeStartsOn: null,
  noticeEndsOn: null,
  feedbackId: null,
  actor: pm,
  createdAt: day(20),
};
// On the oldest entry, so its link points below the first page.
const onFirst: CommentView = {
  id: '01890a5d-ac96-774b-bcce-b30209000a01',
  parent: { kind: 'feedback', id: first.id },
  author: joel,
  body: 'Looking back, this was the turning point.',
  createdAt: day(21),
  editedAt: null,
  deletedAt: null,
};

const profilePath = `/batches/${batchId}/interns/${internId}`;

const stub = ({
  list = feedback,
  events = [lifted, notice, onboarding],
  comments = [onFirst],
}: Partial<{
  list: FeedbackView[];
  events: InternStatusEvent[];
  comments: CommentView[];
}> = {}) =>
  stubApi({
    ...signedInWith(['mentor'] as [Role], { id: vik.id, name: vik.name }),
    [`GET /batches/${batchId}`]: { status: 200, body: batch },
    [`GET ${profilePath}`]: { status: 200, body: intern({ statusEvents: events }) },
    [`GET ${profilePath}/feedback`]: { status: 200, body: list },
    [`GET ${profilePath}/conversations`]: { status: 200, body: [] },
    [`GET ${profilePath}/comments`]: { status: 200, body: comments },
  });

const open = async () => {
  const user = userEvent.setup();
  renderApp(profilePath);
  await screen.findByRole('list', { name: 'Timeline' });
  return user;
};

const labels = () =>
  within(screen.getByRole('list', { name: 'Timeline' }))
    .getAllByRole('article')
    .map((article) =>
      article.id
        ? article.id.replace(/^feedback-.*(\d\d)$/, 'feedback $1')
        : article.getAttribute('aria-label'),
    );

describe('status changes on the timeline (10.6)', () => {
  it('shows each change with who, when and why, above the feedback that caused it', async () => {
    stub();
    await open();

    expect(labels().slice(0, 5)).toEqual([
      'Comment from Joel Fernandes',
      'Status change',
      'Status change',
      'feedback 12',
      'feedback 11',
    ]);
    const [liftedEntry, noticeEntry] = screen
      .getAllByRole('article', { name: 'Status change' })
      .map((article) => within(article));
    if (!liftedEntry || !noticeEntry) throw new Error('no status entries');
    expect(liftedEntry.getByText('Status changed')).toBeInTheDocument();
    expect(liftedEntry.getByText('On notice')).toHaveAttribute('data-type', 'error');
    expect(liftedEntry.getByText('Active')).toHaveAttribute('data-type', 'info');
    expect(liftedEntry.getByText('· Rajesh Menon · 20 Oct 2026')).toBeInTheDocument();
    expect(liftedEntry.getByText('track')).toHaveClass('font-semibold');
    expect(
      noticeEntry.getByText('Notice given in the October 2026 feedback. Runs until 12 Nov 2026.'),
    ).toBeInTheDocument();
    expect(noticeEntry.getByText('· Vikram Shetty · 12 Oct 2026')).toBeInTheDocument();
  });

  it('leaves onboarding out', async () => {
    stub({ list: [last], events: [onboarding], comments: [] });
    await open();

    expect(screen.queryByRole('article', { name: 'Status change' })).not.toBeInTheDocument();
  });

  it('shows "No feedback yet" when onboarding is all there is', async () => {
    stub({ list: [], events: [onboarding], comments: [] });
    renderApp(profilePath);

    expect(await screen.findByText('No feedback yet')).toBeInTheDocument();
  });

  it('shows the timeline for a status change without feedback', async () => {
    stub({
      list: [],
      events: [
        { ...lifted, toStatus: 'withdrawn', fromStatus: 'active', reason: 'Left the programme.' },
        onboarding,
      ],
      comments: [],
    });
    await open();

    expect(screen.queryByText('No feedback yet')).not.toBeInTheDocument();
    expect(screen.getByText('Left the programme.')).toBeInTheDocument();
  });
});

describe('showing earlier activity (10.6)', () => {
  it('shows ten entries, then the rest, counting what is hidden', async () => {
    stub();
    const user = await open();

    expect(labels()).toHaveLength(10);
    expect(labels().at(-1)).toBe('feedback 06');
    await user.click(screen.getByRole('button', { name: 'Show earlier activity (5)' }));

    expect(labels()).toHaveLength(15);
    expect(labels().at(-1)).toBe('feedback 01');
    expect(screen.queryByRole('button', { name: /Show earlier activity/ })).not.toBeInTheDocument();
  });

  it('reveals a hidden entry a link points at', async () => {
    stub();
    const user = await open();
    expect(document.getElementById(`feedback-${first.id}`)).toBeNull();

    await user.click(screen.getByRole('link', { name: 'Vikram Shetty’s feedback (1 Oct)' }));

    expect(document.getElementById(`feedback-${first.id}`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show earlier activity/ })).not.toBeInTheDocument();
  });
});
