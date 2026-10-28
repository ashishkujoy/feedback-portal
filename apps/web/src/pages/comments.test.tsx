import type {
  BatchDetail,
  CommentView,
  ConversationView,
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
import { problem, type Reply, signedInWith, stubApi } from '../test/stub-api.ts';

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

const conversationId = '01890a5d-ac96-774b-bcce-b30209000c01';
const vikram: FeedbackView = {
  id: '01890a5d-ac96-774b-bcce-b30209000301',
  internId,
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
const delivered: FeedbackView = {
  ...vikram,
  id: '01890a5d-ac96-774b-bcce-b30209000302',
  author: anjali,
  body: 'No improvement since September.',
  state: 'delivered',
  conversationId,
  submittedAt: '2026-10-08T12:00:00.000Z',
  deliveredOn: '2026-10-10',
};
const conversation: ConversationView = {
  id: conversationId,
  internId,
  recordedBy: pm,
  heldOn: '2026-10-10',
  notes: 'Delivered in person.',
  createdAt: '2026-10-10T15:00:00.000Z',
  updatedAt: '2026-10-10T15:00:00.000Z',
  editedAt: null,
  feedback: { id: delivered.id, author: anjali, submittedAt: '2026-10-08T12:00:00.000Z' },
};

const comment = (overrides: Partial<CommentView> & Pick<CommentView, 'id'>): CommentView => ({
  parent: { kind: 'feedback', id: vikram.id },
  author: joel,
  body: 'Agree. She also helped two others with their test setup.',
  createdAt: '2026-10-23T09:00:00.000Z',
  editedAt: null,
  deletedAt: null,
  ...overrides,
});
const onVikram = comment({ id: '01890a5d-ac96-774b-bcce-b30209000a01' });
const mine = comment({
  id: '01890a5d-ac96-774b-bcce-b30209000a02',
  parent: { kind: 'feedback', id: delivered.id },
  author: vik,
  body: 'Reviewed her PR for PAY-214.\nTests are in.',
  createdAt: '2026-10-20T09:00:00.000Z',
  editedAt: '2026-10-21T09:00:00.000Z',
});
const removed = comment({
  id: '01890a5d-ac96-774b-bcce-b30209000a03',
  parent: { kind: 'conversation', id: conversationId },
  author: anjali,
  body: '',
  createdAt: '2026-10-17T09:00:00.000Z',
  deletedAt: '2026-10-18T09:00:00.000Z',
});

const profilePath = `/batches/${batchId}/interns/${internId}`;
const commentsPath = `${profilePath}/comments`;

const stub = ({
  roles = ['mentor'],
  viewer = { id: vik.id, name: vik.name },
  profile = intern(),
  shown = batch,
  comments = { status: 200, body: [onVikram, mine, removed] },
  post = { status: 201, body: onVikram },
}: Partial<{
  roles: [Role, ...Role[]];
  viewer: Parameters<typeof signedInWith>[1];
  profile: InternDetail;
  shown: BatchDetail;
  comments: Reply;
  post: Reply;
}> = {}) =>
  stubApi({
    ...signedInWith(roles, viewer),
    [`GET /batches/${batchId}`]: { status: 200, body: shown },
    [`GET ${profilePath}`]: { status: 200, body: profile },
    [`GET ${profilePath}/feedback`]: { status: 200, body: [vikram, delivered] },
    [`GET ${profilePath}/conversations`]: { status: 200, body: [conversation] },
    [`GET ${commentsPath}`]: comments,
    [`POST ${profilePath}/feedback/${vikram.id}/comments`]: post,
    [`POST ${profilePath}/conversations/${conversationId}/comments`]: post,
    [`PATCH ${commentsPath}/${mine.id}`]: { status: 200, body: { ...mine, body: 'Changed.' } },
    [`DELETE ${commentsPath}/${mine.id}`]: { status: 204 },
  });

const open = async () => {
  const user = userEvent.setup();
  renderApp(profilePath);
  await screen.findByRole('list', { name: 'Timeline' });
  return user;
};

const articles = () =>
  within(screen.getByRole('list', { name: 'Timeline' })).getAllByRole('article');
const card = (name: string) => within(screen.getByRole('article', { name }));

const calls = (fetchMock: ReturnType<typeof stubApi>, method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => (init?.method ?? 'GET') === method)
    .map(([input, init]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return {
        path: new URL(url, location.href).pathname.replace(/^\/api/, ''),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      };
    });

const commentLoads = (fetchMock: ReturnType<typeof stubApi>) =>
  calls(fetchMock, 'GET').filter(({ path }) => path === commentsPath).length;

describe('comments on the timeline (10.5)', () => {
  it('shows each comment as its own entry, newest first, linked to what it is on', async () => {
    stub();
    await open();

    expect(articles().map((article) => article.getAttribute('aria-label'))).toEqual([
      'Comment from Joel Fernandes',
      'Feedback from Vikram Shetty',
      'Comment from Vikram Shetty',
      'Comment from Anjali Deshpande',
      'Conversation recorded by Rajesh Menon',
      'Feedback from Anjali Deshpande',
    ]);
    const joels = card('Comment from Joel Fernandes');
    expect(joels.getByRole('link', { name: 'Vikram Shetty’s feedback (22 Oct)' })).toHaveAttribute(
      'href',
      `#feedback-${vikram.id}`,
    );
    expect(joels.getByText('· 23 Oct 2026', { exact: false })).toBeInTheDocument();
    expect(joels.getByText(onVikram.body)).toBeInTheDocument();

    const vikrams = card('Comment from Vikram Shetty');
    expect(vikrams.getByText('· 20 Oct 2026 · edited', { exact: false })).toBeInTheDocument();
    expect(vikrams.getByText(/Reviewed her PR for PAY-214\.\s+Tests are in\./)).toHaveClass(
      'whitespace-pre-wrap',
    );

    const anjalis = card('Comment from Anjali Deshpande');
    expect(
      anjalis.getByRole('link', { name: 'Rajesh Menon’s conversation (10 Oct)' }),
    ).toHaveAttribute('href', `#conversation-${conversationId}`);
    expect(anjalis.getByText('This comment was deleted.')).toHaveClass('italic');
    expect(
      screen.getByRole('article', { name: 'Conversation recorded by Rajesh Menon' }),
    ).toHaveAttribute('id', `conversation-${conversationId}`);
  });

  it('counts each card’s comments, deleted ones included', async () => {
    stub();
    await open();

    expect(card('Feedback from Vikram Shetty').getByText('1 comment above')).toBeInTheDocument();
    expect(card('Feedback from Anjali Deshpande').getByText('1 comment above')).toBeInTheDocument();
    expect(
      card('Conversation recorded by Rajesh Menon').getByText('1 comment above'),
    ).toBeInTheDocument();
  });

  it('gives Edit and Delete on the viewer’s own live comments only', async () => {
    stub();
    await open();

    expect(
      card('Comment from Vikram Shetty')
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Edit', 'Delete']);
    expect(card('Comment from Joel Fernandes').queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    ['an admin who is neither mentor nor PM', { roles: ['admin'] as [Role], viewer: {} }],
    [
      'a read-only intern',
      {
        profile: intern({
          status: 'withdrawn',
          statusEvents: [
            onboarding,
            { ...onboarding, id: '01890a5d-ac96-774b-bcce-b30209000011', toStatus: 'withdrawn' },
          ],
        }),
      },
    ],
    ['an archived batch', { shown: { ...batch, isArchived: true } }],
  ])('shows comments with no buttons to %s', async (_, options) => {
    stub(options);
    await open();

    expect(screen.queryByRole('button', { name: 'Comment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(card('Feedback from Vikram Shetty').getByText('1 comment above')).toBeInTheDocument();
    expect(articles()).toHaveLength(6);
  });

  it('keeps the rest readable when the comments fail to load', async () => {
    stub({ comments: problem(403, 'forbidden', 'Not allowed.') });
    await open();

    expect(screen.getByText("We couldn't load the comments")).toBeInTheDocument();
    expect(articles()).toHaveLength(3);
    expect(card('Feedback from Vikram Shetty').getByText('No comments')).toBeInTheDocument();
  });
});

describe('adding a comment', () => {
  it('opens the composer from the card, posts the text as typed and refreshes', async () => {
    const fetchMock = stub({ comments: { status: 200, body: [] } });
    const user = await open();
    const feedbackCard = card('Feedback from Vikram Shetty');
    expect(feedbackCard.getByText('No comments')).toBeInTheDocument();

    await user.click(feedbackCard.getByRole('button', { name: 'Comment', expanded: false }));
    const input = feedbackCard.getByRole('textbox', { name: 'Add a comment' });
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('placeholder', 'Add a comment');
    const loads = commentLoads(fetchMock);
    await user.type(input, ' Agree. ');
    // The row's Comment opened it; the composer's own Comment posts.
    const [toggle, post] = feedbackCard.getAllByRole('button', { name: 'Comment' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    if (!post) throw new Error('no post button');
    await user.click(post);

    expect(calls(fetchMock, 'POST')).toEqual([
      { path: `${profilePath}/feedback/${vikram.id}/comments`, body: { body: ' Agree. ' } },
    ]);
    expect(commentLoads(fetchMock)).toBe(loads + 1);
    expect(feedbackCard.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('comments on a conversation', async () => {
    const fetchMock = stub();
    const user = await open();
    const conversationCard = card('Conversation recorded by Rajesh Menon');

    await user.click(conversationCard.getByRole('button', { name: 'Comment' }));
    await user.type(
      conversationCard.getByRole('textbox', { name: 'Add a comment' }),
      'Noted.{Enter}',
    );

    expect(calls(fetchMock, 'POST')).toEqual([
      { path: `${profilePath}/conversations/${conversationId}/comments`, body: { body: 'Noted.' } },
    ]);
  });

  it('refuses a blank comment before sending', async () => {
    const fetchMock = stub();
    const user = await open();
    const feedbackCard = card('Feedback from Vikram Shetty');

    await user.click(feedbackCard.getByRole('button', { name: 'Comment' }));
    await user.type(feedbackCard.getByRole('textbox', { name: 'Add a comment' }), '  {Enter}');

    expect(feedbackCard.getByText('Write a comment.')).toBeInTheDocument();
    expect(
      feedbackCard.getByRole('textbox', { name: 'Add a comment' }),
    ).toHaveAccessibleDescription('Write a comment.');
    expect(calls(fetchMock, 'POST')).toEqual([]);
  });

  it('shows a refusal with the API’s sentence and keeps the text', async () => {
    stub({
      post: problem(
        409,
        'intern_read_only',
        'This intern is Withdrawn, so their record is read-only',
      ),
    });
    const user = await open();
    const feedbackCard = card('Feedback from Vikram Shetty');

    await user.click(feedbackCard.getByRole('button', { name: 'Comment' }));
    await user.type(feedbackCard.getByRole('textbox', { name: 'Add a comment' }), 'Agree.{Enter}');

    expect(
      await feedbackCard.findByText('This intern is Withdrawn, so their record is read-only'),
    ).toBeInTheDocument();
    expect(feedbackCard.getByRole('textbox', { name: 'Add a comment' })).toHaveValue('Agree.');
  });
});

describe('editing and deleting your own comment', () => {
  it('edits the text in place and saves it', async () => {
    const fetchMock = stub();
    const user = await open();
    const entry = card('Comment from Vikram Shetty');

    await user.click(entry.getByRole('button', { name: 'Edit' }));
    const input = entry.getByRole('textbox', { name: 'Edit comment' });
    expect(input).toHaveValue(mine.body);
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, 'Changed.');
    await user.click(entry.getByRole('button', { name: 'Save' }));

    expect(calls(fetchMock, 'PATCH')).toEqual([
      { path: `${commentsPath}/${mine.id}`, body: { body: 'Changed.' } },
    ]);
    expect(entry.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('sends nothing for Cancel or an unchanged text', async () => {
    const fetchMock = stub();
    const user = await open();
    const entry = card('Comment from Vikram Shetty');

    await user.click(entry.getByRole('button', { name: 'Edit' }));
    await user.type(entry.getByRole('textbox', { name: 'Edit comment' }), ' more');
    await user.click(entry.getByRole('button', { name: 'Cancel' }));
    expect(entry.getByText(/Reviewed her PR/)).toBeInTheDocument();

    await user.click(entry.getByRole('button', { name: 'Edit' }));
    expect(entry.getByRole('textbox', { name: 'Edit comment' })).toHaveValue(mine.body);
    await user.click(entry.getByRole('button', { name: 'Save' }));

    expect(entry.queryByRole('textbox')).not.toBeInTheDocument();
    expect(calls(fetchMock, 'PATCH')).toEqual([]);
  });

  it('asks before deleting, and sends nothing on Cancel', async () => {
    const fetchMock = stub();
    const user = await open();

    await user.click(card('Comment from Vikram Shetty').getByRole('button', { name: 'Delete' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Delete this comment?' }));
    expect(
      dialog.getByText('It will show as “This comment was deleted.” to everyone in the batch.'),
    ).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    expect(calls(fetchMock, 'DELETE')).toEqual([]);

    await user.click(card('Comment from Vikram Shetty').getByRole('button', { name: 'Delete' }));
    const loads = commentLoads(fetchMock);
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete this comment?' })).getByRole('button', {
        name: 'Delete',
      }),
    );

    expect(calls(fetchMock, 'DELETE')).toEqual([
      { path: `${commentsPath}/${mine.id}`, body: undefined },
    ]);
    expect(commentLoads(fetchMock)).toBe(loads + 1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
