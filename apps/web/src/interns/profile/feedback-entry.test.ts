import type {
  CommentView,
  ConversationView,
  FeedbackView,
  InternStatusEvent,
} from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import {
  colourChange,
  commentCounts,
  commentNote,
  conversationLabel,
  dayAndMonth,
  excerpt,
  feedbackLabel,
  feedbackLine,
  latestColouredOn,
  pagesShowing,
  pageSize,
  shortPeriod,
  shownEntries,
  stateBadge,
  statusNote,
  timelineEntries,
} from './feedback-entry.ts';

const entry = (overrides: Partial<FeedbackView> = {}): FeedbackView => ({
  id: '01890a5d-ac96-774b-bcce-b30209000003',
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

describe('a feedback entry', () => {
  it('has the header line: the submission day where the viewer is, and the period', () => {
    expect(feedbackLine(entry())).toBe('gave feedback · 8 Oct 2026 · period Oct 2026');
    expect(shortPeriod('2027-01-01')).toBe('Jan 2027');
    expect(dayAndMonth(new Date(2026, 9, 23, 23, 30).toISOString())).toBe('23 Oct');
  });

  it('shows the colour change: from → to, a first colour alone, and unchanged', () => {
    expect(colourChange(entry({ colorCode: 'red', previousColorCode: 'borderline_red' }))).toEqual({
      kind: 'changed',
      from: 'borderline_red',
      to: 'red',
    });
    expect(colourChange(entry({ colorCode: 'yellow' }))).toEqual({ kind: 'first', to: 'yellow' });
    expect(colourChange(entry())).toEqual({ kind: 'unchanged', code: null });
    // The same colour again isn't "Red → Red" (9.6 decision 2).
    expect(colourChange(entry({ colorCode: 'red', previousColorCode: 'red' }))).toEqual({
      kind: 'unchanged',
      code: 'red',
    });
  });

  it('is awaiting delivery until delivered', () => {
    expect(stateBadge(entry())).toEqual({ type: 'info', label: 'Awaiting delivery' });
    expect(stateBadge(entry({ state: 'delivered' }))).toEqual({
      type: 'success',
      label: 'Delivered',
    });
  });
});

describe('a draft excerpt', () => {
  it('drops the Markdown and joins the lines', () => {
    expect(
      excerpt('### Summary\n- **Pairs** often\n- Closed `PAY-214`\n\nSee [the PR](https://x.test)'),
    ).toBe('Summary Pairs often Closed PAY-214 See the PR');
  });

  it('cuts long text at a word', () => {
    const long = `${'word '.repeat(40)}end`;
    const cut = excerpt(long);
    expect(cut.endsWith('word…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(161);
  });
});

describe('the latest coloured feedback', () => {
  it('is the newest submitted entry with a colour, ignoring drafts and no-colour entries', () => {
    expect(
      latestColouredOn([
        entry({ state: 'draft', colorCode: 'green', submittedAt: null }),
        entry({ colorCode: null, submittedAt: '2026-10-22T12:00:00.000Z' }),
        entry({ colorCode: 'red', submittedAt: '2026-10-08T12:00:00.000Z' }),
        entry({ colorCode: 'orange', submittedAt: '2026-09-12T12:00:00.000Z' }),
      ]),
    ).toBe('8 Oct 2026');
    expect(latestColouredOn([entry()])).toBeNull();
  });
});

const conversationOn = (heldOn: string, createdAt: string): ConversationView => ({
  id: `01890a5d-ac96-774b-bcce-b3020900c${heldOn.slice(8)}${createdAt.slice(11, 13)}`
    .padEnd(36, '0')
    .slice(0, 36),
  internId: '01890a5d-ac96-774b-bcce-b30209000002',
  recordedBy: { id: '01890a5d-ac96-774b-bcce-b30209000005', name: 'Raj', avatarUrl: null },
  heldOn,
  notes: 'Notes',
  createdAt,
  updatedAt: createdAt,
  editedAt: null,
  feedback: {
    id: '01890a5d-ac96-774b-bcce-b30209000003',
    author: { id: '01890a5d-ac96-774b-bcce-b30209000004', name: 'Pat Lee', avatarUrl: null },
    submittedAt: '2026-10-08T12:00:00.000Z',
  },
});

const commentOn = (parentId: string, id: string, createdAt: string): CommentView => ({
  id,
  parent: { kind: parentId === 'feedback' ? 'feedback' : 'conversation', id: parentId },
  author: { id: '01890a5d-ac96-774b-bcce-b30209000006', name: 'Joel', avatarUrl: null },
  body: 'Agree.',
  createdAt,
  editedAt: null,
  deletedAt: null,
});

describe('comments on cards', () => {
  it("counts each parent's comments, deleted ones included", () => {
    const deleted = { ...commentOn('a', '1', '2026-10-10T08:00:00.000Z'), deletedAt: 'x' };
    const counts = commentCounts([
      deleted,
      commentOn('a', '2', '2026-10-11T08:00:00.000Z'),
      commentOn('b', '3', '2026-10-11T08:00:00.000Z'),
    ]);
    expect([counts.get('a'), counts.get('b'), counts.get('c')]).toEqual([2, 1, undefined]);
  });

  it('says how many there are, and that they sit above the card', () => {
    expect([commentNote(0), commentNote(1), commentNote(3)]).toEqual([
      'No comments',
      '1 comment above',
      '3 comments above',
    ]);
  });

  it('names what a comment is on', () => {
    expect(feedbackLabel(entry({ submittedAt: '2026-10-22T12:00:00.000Z' }))).toBe(
      'Pat Lee’s feedback (22 Oct)',
    );
    expect(conversationLabel(conversationOn('2026-10-10', '2026-10-10T05:00:00.000Z'))).toBe(
      'Raj’s conversation (10 Oct)',
    );
  });
});

describe('the timeline order', () => {
  it('puts drafts first, then feedback and conversations newest first, a conversation first on its day', () => {
    const draft = entry({ id: 'draft', state: 'draft', submittedAt: null });
    const morning = entry({ id: 'morning', submittedAt: '2026-10-10T06:00:00.000Z' });
    const earlier = entry({ id: 'earlier', submittedAt: '2026-10-08T12:00:00.000Z' });
    const later = entry({ id: 'later', submittedAt: '2026-10-12T12:00:00.000Z' });
    const sameDay = conversationOn('2026-10-10', '2026-10-10T05:00:00.000Z');

    expect(
      timelineEntries([later, draft, morning, earlier], [sameDay], [], []).map((item) =>
        item.kind === 'feedback' ? item.entry.id : 'conversation',
      ),
    ).toEqual(['draft', 'later', 'conversation', 'morning', 'earlier']);
  });

  it('puts comments newest first by their day, before what they follow on the same day', () => {
    const feedback = entry({ id: 'feedback', submittedAt: '2026-10-10T12:00:00.000Z' });
    const held = conversationOn('2026-10-12', '2026-10-12T09:00:00.000Z');
    const onFeedback = commentOn('feedback', 'same-day', '2026-10-10T08:00:00.000Z');
    const onConversation = commentOn(held.id, 'on-conversation', '2026-10-12T07:00:00.000Z');
    const latest = commentOn('feedback', 'latest', '2026-10-14T09:00:00.000Z');

    expect(
      timelineEntries([feedback], [held], [onFeedback, onConversation, latest], []).map((item) =>
        item.kind === 'conversation' ? 'conversation' : item.id,
      ),
    ).toEqual(['latest', 'on-conversation', 'conversation', 'same-day', 'feedback']);
  });

  it('dates delivered feedback by its conversation', () => {
    expect(stateBadge(entry({ state: 'delivered', deliveredOn: '2026-10-10' }))).toEqual({
      type: 'success',
      label: 'Delivered 10 Oct',
    });
  });
});

const event = (
  overrides: Partial<InternStatusEvent> & Pick<InternStatusEvent, 'id'>,
): InternStatusEvent => ({
  fromStatus: 'active',
  toStatus: 'on_notice',
  reason: 'Notice given in the October 2026 feedback.',
  noticeStartsOn: '2026-10-08',
  noticeEndsOn: '2026-11-08',
  feedbackId: null,
  actor: { id: '01890a5d-ac96-774b-bcce-b30209000004', name: 'Pat Lee' },
  createdAt: '2026-10-08T12:00:00.000Z',
  ...overrides,
});

describe('status changes on the timeline (10.6)', () => {
  it('puts a status change above the feedback that caused it, and leaves out onboarding', () => {
    const gave = entry({ id: 'feedback', submittedAt: '2026-10-08T12:00:00.000Z' });
    const notice = event({ id: 'notice', feedbackId: 'feedback' });
    const lifted = event({
      id: 'lifted',
      fromStatus: 'on_notice',
      toStatus: 'active',
      reason: 'Back on track.',
      createdAt: '2026-10-20T09:00:00.000Z',
    });
    const onboarding = event({
      id: 'onboarding',
      fromStatus: null,
      toStatus: 'active',
      createdAt: '2026-07-07T09:00:00.000Z',
    });
    const sameDayComment = commentOn('feedback', 'comment', '2026-10-08T15:00:00.000Z');

    expect(
      timelineEntries([gave], [], [sameDayComment], [lifted, notice, onboarding]).map(
        ({ id }) => id,
      ),
    ).toEqual(['lifted', 'comment', 'notice', 'feedback']);
  });

  it('notes the reason, and when a notice runs until', () => {
    expect(statusNote(event({ id: 'notice' }))).toBe(
      'Notice given in the October 2026 feedback. Runs until 8 Nov 2026.',
    );
    expect(
      statusNote(
        event({
          id: 'lift',
          toStatus: 'active',
          reason: 'Back on track.',
          noticeEndsOn: '2026-11-08',
        }),
      ),
    ).toBe('Back on track.');
  });
});

describe('showing earlier activity (10.6)', () => {
  const dated = Array.from({ length: 25 }, (_, index) =>
    entry({
      id: `entry-${index}`,
      submittedAt: `2026-09-${String(30 - index).padStart(2, '0')}T12:00:00.000Z`,
    }),
  );
  const drafts = [1, 2].map((n) => entry({ id: `draft-${n}`, state: 'draft', submittedAt: null }));
  const all = timelineEntries([...drafts, ...dated], [], [], []);

  it('shows the drafts and ten entries per page, and counts the rest', () => {
    expect(pageSize).toBe(10);
    const first = shownEntries(all, 1);
    expect(first.shown.map(({ id }) => id)).toEqual([
      'draft-1',
      'draft-2',
      ...dated.slice(0, 10).map(({ id }) => id),
    ]);
    expect(first.hidden).toBe(15);
    expect(shownEntries(all, 2).hidden).toBe(5);
    expect(shownEntries(all, 3)).toEqual({ shown: all, hidden: 0 });
  });

  it('finds how many pages show an entry, never fewer than already shown', () => {
    expect(pagesShowing(all, 'entry-9', 1)).toBe(1);
    expect(pagesShowing(all, 'entry-10', 1)).toBe(2);
    expect(pagesShowing(all, 'entry-24', 1)).toBe(3);
    expect(pagesShowing(all, 'entry-0', 3)).toBe(3);
    expect(pagesShowing(all, 'draft-2', 1)).toBe(1);
    expect(pagesShowing(all, 'unknown', 2)).toBe(2);
  });
});
