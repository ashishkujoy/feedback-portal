import type {
  BatchDetail,
  ConversationView,
  FeedbackView,
  InternDetail,
  InternStatusEvent,
  Role,
} from '@feedback-portal/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../app/query-client.ts';
import {
  type ConversationTarget,
  RecordConversationDialog,
} from '../interns/profile/record-conversation-dialog.tsx';
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
const me = userWith(['program_manager']);
const pm = { id: me.id, name: me.name, avatarUrl: null };
const anjali = {
  id: '01890a5d-ac96-774b-bcce-b30209000097',
  name: 'Anjali Deshpande',
  avatarUrl: null,
};
const vik = { id: '01890a5d-ac96-774b-bcce-b30209000098', name: 'Vikram Shetty', avatarUrl: null };

const batch: BatchDetail = {
  id: batchId,
  name: 'Batch 2026',
  startDate: '2026-07-06',
  endDate: '2028-01-06',
  isArchived: false,
  programManager: pm,
  mentorCount: 2,
  interns: { ...noInternCounts, total: 1 },
  mentors: [anjali, vik],
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

let next = 0;
const entry = (overrides: Partial<FeedbackView> = {}): FeedbackView => ({
  id: `01890a5d-ac96-774b-bcce-b302090003${String((next += 1)).padStart(2, '0')}`,
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
  deliveredOn: null,
  ...overrides,
});

const vikram = entry({ body: 'Clear improvement this fortnight. Closed `PAY-214` with tests.' });
const meghna = entry({
  author: { ...anjali, name: 'Meghna Bose' },
  body: 'Led the team retro on Friday.',
  submittedAt: '2026-10-21T12:00:00.000Z',
});
const conversationId = '01890a5d-ac96-774b-bcce-b30209000c01';
const delivered = entry({
  author: anjali,
  colorCode: 'red',
  previousColorCode: 'borderline_red',
  body: 'No improvement since September.',
  state: 'delivered',
  conversationId,
  submittedAt: '2026-10-08T12:00:00.000Z',
  deliveredOn: '2026-10-10',
});
const conversation: ConversationView = {
  id: conversationId,
  internId,
  recordedBy: pm,
  heldOn: '2026-10-10',
  notes: 'Delivered in person.\n\nAgreed on a **daily check-in**.',
  createdAt: '2026-10-10T15:00:00.000Z',
  updatedAt: '2026-10-10T15:00:00.000Z',
  editedAt: null,
  feedback: { id: delivered.id, author: anjali, submittedAt: '2026-10-08T12:00:00.000Z' },
};

const onlyDelivered: readonly FeedbackView[] = [delivered];

const profilePath = `/batches/${batchId}/interns/${internId}`;
const conversationsPath = `${profilePath}/conversations`;

const stub = ({
  roles = ['program_manager'],
  viewer = {},
  profile = intern(),
  list = [vikram, meghna, delivered],
  conversations = { status: 200, body: [conversation] },
  record = { status: 201, body: conversation },
}: Partial<{
  roles: [Role, ...Role[]];
  /** Who is signed in, when not the batch's PM. */
  viewer: Parameters<typeof signedInWith>[1];
  profile: InternDetail;
  list: FeedbackView[];
  conversations: Reply;
  record: Reply;
}> = {}) => {
  const replies: Record<string, Reply> = {
    ...signedInWith(roles, viewer),
    [`GET /batches/${batchId}`]: { status: 200, body: batch },
    [`GET ${profilePath}`]: { status: 200, body: profile },
    [`GET ${profilePath}/feedback`]: { status: 200, body: list },
    [`GET ${conversationsPath}`]: conversations,
    [`POST ${conversationsPath}`]: record,
    [`PATCH ${conversationsPath}/${conversationId}`]: {
      status: 200,
      body: { ...conversation, editedAt: '2026-10-24T10:00:00.000Z' },
    },
  };
  return { replies, fetchMock: stubApi(replies) };
};

const open = async () => {
  const user = userEvent.setup();
  renderApp(profilePath);
  await screen.findByRole('list', { name: 'Timeline' });
  return user;
};

const cards = () => within(screen.getByRole('list', { name: 'Timeline' })).getAllByRole('article');
const card = (name: string) => within(screen.getByRole('article', { name }));

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

describe('conversations on the timeline (10.3)', () => {
  it('shows each conversation, newest first among the feedback, linked to what it delivered', async () => {
    stub();
    await open();

    expect(cards().map((article) => article.getAttribute('aria-label'))).toEqual([
      'Feedback from Vikram Shetty',
      'Feedback from Meghna Bose',
      'Conversation recorded by Ada Lovelace',
      'Feedback from Anjali Deshpande',
    ]);
    const recorded = card('Conversation recorded by Ada Lovelace');
    expect(
      recorded.getByText('recorded a conversation · 10 Oct 2026', { exact: false }),
    ).toBeInTheDocument();
    expect(
      recorded.getByRole('link', { name: 'Anjali Deshpande’s feedback (8 Oct)' }),
    ).toHaveAttribute('href', `#feedback-${delivered.id}`);
    expect(recorded.getByText('daily check-in')).toBeInTheDocument();
    expect(card('Feedback from Anjali Deshpande').getByText('Delivered 10 Oct')).toHaveAttribute(
      'data-type',
      'success',
    );
  });

  it('gives the PM Record conversation on awaiting feedback only, and Edit on conversations', async () => {
    stub();
    await open();

    const buttons = cards().map((article) =>
      within(article)
        .queryAllByRole('button')
        .map((button) => button.textContent),
    );
    expect(buttons).toEqual([['Record conversation'], ['Record conversation'], ['Edit'], []]);
  });

  it('gives mentors no conversation buttons', async () => {
    stub({ roles: ['mentor'], viewer: { id: vik.id, name: vik.name } });
    await open();

    expect(screen.queryByRole('button', { name: 'Record conversation' })).not.toBeInTheDocument();
    expect(
      card('Conversation recorded by Ada Lovelace').queryByRole('button'),
    ).not.toBeInTheDocument();
  });

  it('keeps the feedback readable when the conversations fail to load', async () => {
    stub({ conversations: problem(403, 'forbidden', 'Not allowed.') });
    await open();

    expect(screen.getByText("We couldn't load the conversations")).toBeInTheDocument();
    expect(cards()).toHaveLength(3);
  });
});

describe('recording a conversation (A8)', () => {
  it('opens with the chosen feedback, today, and the PM as Delivered by', async () => {
    stub();
    const user = await open();

    await user.click(
      card('Feedback from Meghna Bose').getByRole('button', { name: 'Record conversation' }),
    );

    const dialog = within(screen.getByRole('dialog', { name: 'Record conversation' }));
    expect(
      screen.getByText('Ishita Rao · 2 submitted feedback awaiting delivery.'),
    ).toBeInTheDocument();
    expect(dialog.getAllByRole('radio')).toHaveLength(2);
    expect(
      dialog.getByRole('radio', { name: 'Meghna Bose · submitted 21 Oct 2026' }),
    ).toBeChecked();
    expect(
      dialog.getByRole('radio', { name: 'Vikram Shetty · submitted 22 Oct 2026' }),
    ).not.toBeChecked();
    expect(dialog.getByLabelText(/^Date delivered/)).toHaveValue('2026-10-24');
    expect(dialog.getByRole('textbox', { name: 'Delivered by' })).toHaveValue('Ada Lovelace');
    expect(dialog.getByRole('textbox', { name: 'Delivered by' })).toBeDisabled();
  });

  it('saves the conversation and refreshes the timeline', async () => {
    const { fetchMock } = stub();
    const user = await open();
    await user.click(
      card('Feedback from Vikram Shetty').getByRole('button', { name: 'Record conversation' }),
    );
    const dialog = within(screen.getByRole('dialog', { name: 'Record conversation' }));

    await user.click(dialog.getByRole('radio', { name: 'Meghna Bose · submitted 21 Oct 2026' }));
    await user.type(dialog.getByRole('textbox', { name: 'Conversation notes' }), 'Went well.');
    await user.click(dialog.getByRole('button', { name: 'Save conversation' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent(fetchMock, 'POST')).toEqual([
      {
        path: conversationsPath,
        body: { heldOn: '2026-10-24', notes: 'Went well.', feedbackId: meghna.id },
      },
    ]);
    const gets = fetchMock.mock.calls.filter(([input, init]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return (init?.method ?? 'GET') === 'GET' && url.endsWith('/conversations');
    });
    expect(gets.length).toBeGreaterThanOrEqual(2);
  });

  it('asks for the notes, and shows the API refusal', async () => {
    const { fetchMock } = stub({
      record: problem(409, 'feedback_delivered', 'This feedback has already been delivered.'),
    });
    const user = await open();
    await user.click(
      card('Feedback from Vikram Shetty').getByRole('button', { name: 'Record conversation' }),
    );
    const dialog = within(screen.getByRole('dialog', { name: 'Record conversation' }));

    await user.click(dialog.getByRole('button', { name: 'Save conversation' }));
    expect(dialog.getByRole('textbox', { name: 'Conversation notes' })).toHaveAccessibleDescription(
      'Write how the conversation went.',
    );
    expect(sent(fetchMock, 'POST')).toEqual([]);

    await user.type(dialog.getByRole('textbox', { name: 'Conversation notes' }), 'Went well.');
    await user.click(dialog.getByRole('button', { name: 'Save conversation' }));

    expect(await dialog.findByText("We couldn't save the conversation")).toBeInTheDocument();
    expect(dialog.getByText('This feedback has already been delivered.')).toBeInTheDocument();
  });
});

describe('editing a conversation', () => {
  it('opens with the delivered feedback fixed, and saves the notes and date', async () => {
    const { fetchMock, replies } = stub();
    const user = await open();
    await user.click(
      card('Conversation recorded by Ada Lovelace').getByRole('button', { name: 'Edit' }),
    );

    const dialog = within(screen.getByRole('dialog', { name: 'Edit conversation' }));
    expect(dialog.queryAllByRole('radio')).toEqual([]);
    expect(dialog.getByText('Anjali Deshpande')).toBeInTheDocument();
    expect(
      dialog.getByText("The feedback a conversation delivered can't change."),
    ).toBeInTheDocument();
    expect(dialog.getByLabelText(/^Date delivered/)).toHaveValue('2026-10-10');

    replies[`GET ${conversationsPath}`] = {
      status: 200,
      body: [{ ...conversation, editedAt: '2026-10-24T10:00:00.000Z' }],
    };
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent(fetchMock, 'PATCH')).toEqual([
      {
        path: `${conversationsPath}/${conversationId}`,
        body: { heldOn: '2026-10-10', notes: conversation.notes },
      },
    ]);
    expect(
      await card('Conversation recorded by Ada Lovelace').findByText(
        'recorded a conversation · 10 Oct 2026 · edited',
        { exact: false },
      ),
    ).toBeInTheDocument();
  });
});

/** A8-empty: the chosen feedback was delivered meanwhile, and nothing else is waiting. */
const stale: ConversationTarget = { kind: 'record', feedbackId: delivered.id };

describe('A8 with nothing awaiting delivery', () => {
  it('says so, and offers no way to save', () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <RecordConversationDialog
          intern={intern()}
          batch={batch}
          entries={onlyDelivered}
          target={stale}
          onClose={vi.fn<() => void>()}
        />
      </QueryClientProvider>,
    );

    const dialog = within(screen.getByRole('dialog', { name: 'Record conversation' }));
    expect(screen.getByText('Ishita Rao · nothing awaiting delivery.')).toBeInTheDocument();
    expect(dialog.getByText('No feedback is waiting to be delivered')).toBeInTheDocument();
    expect(
      dialog.getByText('Feedback for Ishita appears here once a mentor submits it.'),
    ).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Save conversation' })).toBeDisabled();
  });
});
