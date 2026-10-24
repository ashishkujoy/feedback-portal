import type {
  BatchDetail,
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
import { GiveFeedbackDialog } from '../interns/give-feedback-dialog.tsx';
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
const draftId = '01890a5d-ac96-774b-bcce-b30209000003';
const me = userWith(['program_manager']);
const pat = { id: me.id, name: me.name };
const oli = { id: '01890a5d-ac96-774b-bcce-b30209000099', name: 'Oli Park', avatarUrl: null };

const batch = (overrides: Partial<BatchDetail> = {}): BatchDetail => ({
  id: batchId,
  name: 'Batch 2026',
  startDate: '2026-07-06',
  endDate: '2028-01-06',
  isArchived: false,
  programManager: { ...pat, avatarUrl: null },
  mentorCount: 0,
  interns: { ...noInternCounts, total: 1 },
  mentors: [],
  members: [],
  ...overrides,
});

/** A batch someone else runs, with `me` as a current mentor or not at all. */
const othersBatch = (mentor: boolean) =>
  batch({ programManager: oli, mentors: mentor ? [{ ...pat, avatarUrl: null }] : [] });

const onboarding: InternStatusEvent = {
  id: '01890a5d-ac96-774b-bcce-b30209000010',
  fromStatus: null,
  toStatus: 'active',
  reason: null,
  noticeStartsOn: null,
  noticeEndsOn: null,
  actor: pat,
  createdAt: '2026-07-07T09:00:00.000Z',
};

const intern = (overrides: Partial<InternDetail> = {}): InternDetail => ({
  id: internId,
  batchId,
  username: 'ishita.rao',
  name: 'Ishita Rao',
  email: 'ishita@example.com',
  status: 'active',
  colorCode: null,
  noticeEndsOn: null,
  photoUrl: null,
  phone: null,
  diplomaBranch: null,
  parentNames: null,
  interviewNotes: null,
  source: 'manual',
  createdAt: '2026-07-07T09:00:00.000Z',
  addedBy: pat,
  statusEvents: [onboarding],
  ...overrides,
});

const entry = (overrides: Partial<FeedbackView> = {}): FeedbackView => ({
  id: draftId,
  internId,
  period: '2026-09-01',
  body: 'Paired twice.',
  colorCode: 'orange',
  previousColorCode: null,
  givesNotice: false,
  state: 'draft',
  author: { ...pat, avatarUrl: null },
  conversationId: null,
  submittedAt: null,
  createdAt: '2026-10-20T09:00:00.000Z',
  updatedAt: '2026-10-20T09:00:00.000Z',
  ...overrides,
});

const feedbackPath = `/batches/${batchId}/interns/${internId}/feedback`;
const profilePath = `/batches/${batchId}/interns/${internId}`;

type StubOptions = Readonly<{
  roles?: [Role, ...Role[]];
  detail?: BatchDetail;
  profile?: InternDetail;
  answer?: Reply;
}>;

const stub = ({
  roles = ['program_manager'],
  detail = batch(),
  profile = intern(),
  answer = { status: 201, body: entry({ state: 'submitted' }) },
}: StubOptions = {}) =>
  stubApi({
    ...signedInWith(roles),
    [`GET /batches/${batchId}`]: { status: 200, body: detail },
    [`GET ${profilePath}`]: { status: 200, body: profile },
    [`GET ${feedbackPath}`]: { status: 200, body: [] },
    [`POST ${feedbackPath}`]: answer,
    [`PUT ${feedbackPath}/${draftId}`]: { status: 200, body: entry() },
  });

const open = async () => {
  const user = userEvent.setup();
  renderApp(profilePath);
  await screen.findByRole('heading', { level: 1, name: 'Ishita Rao' });
  return user;
};

const giveFeedbackButtons = () => screen.queryAllByRole('button', { name: 'Give feedback' });

/** Opens the profile and the dialog from the header. */
const openDialog = async () => {
  const user = await open();
  const [header] = giveFeedbackButtons();
  if (!header) throw new Error('no Give feedback button');
  await user.click(header);
  const dialog = within(screen.getByRole('dialog', { name: 'Give feedback to Ishita Rao' }));
  return { user, dialog };
};

const sent = (fetchMock: ReturnType<typeof stubApi>, method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([, init]) => (typeof init?.body === 'string' ? JSON.parse(init.body) : undefined));

const gets = (fetchMock: ReturnType<typeof stubApi>, path: string) =>
  fetchMock.mock.calls.filter(([input, init]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return (init?.method ?? 'GET') === 'GET' && new URL(url, location.href).pathname === path;
  }).length;

const editor = (dialog: ReturnType<typeof within>) =>
  dialog.getByRole('textbox', { name: 'Feedback' });

describe('Give feedback', () => {
  it("is in the header and the empty timeline for the batch's PM", async () => {
    stub();
    await open();
    expect(giveFeedbackButtons()).toHaveLength(2);
  });

  it('is there for a current mentor', async () => {
    stub({ roles: ['mentor'], detail: othersBatch(true) });
    await open();
    expect(giveFeedbackButtons()).toHaveLength(2);
  });

  const hidden: [string, StubOptions][] = [
    ['an admin who is neither PM nor mentor', { roles: ['admin'], detail: othersBatch(false) }],
    ['an archived batch', { detail: batch({ isArchived: true }) }],
    [
      'a read-only intern',
      {
        profile: intern({
          status: 'terminated',
          statusEvents: [
            { ...onboarding, id: '01890a5d-ac96-774b-bcce-b30209000011', toStatus: 'terminated' },
            onboarding,
          ],
        }),
      },
    ],
  ];

  it.each(hidden)('is absent for %s', async (_case, options) => {
    stub(options);
    await open();
    expect(giveFeedbackButtons()).toEqual([]);
    expect(screen.getByText('No feedback yet')).toBeInTheDocument();
  });
});

describe('the Give feedback dialog', () => {
  it("shows v2 A7's fields: months, notice, colours and the editor", async () => {
    stub({ profile: intern({ colorCode: 'yellow' }) });
    const { dialog } = await openDialog();

    expect(
      screen.getByText(
        'Visible to all mentors in Batch 2026 once submitted. Drafts are visible only to you.',
      ),
    ).toBeInTheDocument();
    const period = dialog.getByRole('combobox', { name: 'Feedback period' });
    expect(period).toHaveValue('2026-10-01');
    expect(
      within(period)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Choose a month', 'October 2026', 'September 2026', 'August 2026', 'July 2026']);
    const notice = dialog.getByRole('switch', { name: 'Mark as notice' });
    expect(notice).not.toBeChecked();
    expect(notice).toHaveAccessibleDescription('Starts a one-month notice when you submit.');
    const colours = within(dialog.getByRole('group', { name: 'Colour code' }));
    expect(colours.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
      'none',
      'green',
      'yellow',
      'borderline_yellow',
      'orange',
      'borderline_red',
      'red',
    ]);
    expect(colours.getByRole('radio', { name: 'No colour' })).toBeChecked();
    expect(colours.getByRole('radio', { name: 'Borderline Red' })).toHaveAccessibleDescription(
      'Close to Red. Needs to improve now.',
    );
    expect(dialog.getByRole('group', { name: 'Colour code' })).toHaveAccessibleDescription(
      'Current code: Yellow. No colour keeps it. Once a code is set it can’t go back to no colour.',
    );
    expect(editor(dialog)).toHaveAttribute(
      'placeholder',
      'What did you observe, and what should change?',
    );
  });

  it('says when an intern has no colour yet', async () => {
    stub();
    const { dialog } = await openDialog();
    expect(dialog.getByRole('group', { name: 'Colour code' })).toHaveAccessibleDescription(
      'No colour yet. Set by the first coloured feedback.',
    );
  });

  it("selects Red when notice is switched on, and leaves the colour when it's switched off", async () => {
    stub();
    const { user, dialog } = await openDialog();
    const notice = dialog.getByRole('switch', { name: 'Mark as notice' });

    await user.click(notice);

    expect(notice).toBeChecked();
    expect(notice).toHaveAccessibleDescription(
      'Ends 24 Nov 2026. Ada Lovelace then lifts it or terminates. Nothing happens automatically.',
    );
    expect(dialog.getByRole('radio', { name: 'Red' })).toBeChecked();

    await user.click(dialog.getByRole('radio', { name: 'Orange' }));
    await user.click(notice);

    expect(notice).not.toBeChecked();
    expect(dialog.getByRole('radio', { name: 'Orange' })).toBeChecked();
  });

  it('turns notice off for an intern already on notice', async () => {
    stub({ profile: intern({ status: 'on_notice', noticeEndsOn: '2026-11-08' }) });
    const { dialog } = await openDialog();

    const notice = dialog.getByRole('switch', { name: 'Mark as notice' });
    expect(notice).toBeDisabled();
    expect(notice).toHaveAccessibleDescription('Ishita is already on notice until 8 Nov 2026.');
  });

  it('submits, refreshes the profile and its lists, and closes', async () => {
    const fetchMock = stub();
    const { user, dialog } = await openDialog();
    const profileLoads = gets(fetchMock, `/api${profilePath}`);
    const batchLoads = gets(fetchMock, `/api/batches/${batchId}`);

    await user.click(dialog.getByRole('switch', { name: 'Mark as notice' }));
    await user.selectOptions(
      dialog.getByRole('combobox', { name: 'Feedback period' }),
      'September 2026',
    );
    await user.type(editor(dialog), 'No improvement.');
    await user.click(dialog.getByRole('button', { name: 'Submit feedback' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent(fetchMock, 'POST')).toEqual([
      {
        period: '2026-09-01',
        body: 'No improvement.',
        colorCode: 'red',
        givesNotice: true,
        submit: true,
      },
    ]);
    expect(gets(fetchMock, `/api${profilePath}`)).toBe(profileLoads + 1);
    expect(gets(fetchMock, `/api/batches/${batchId}`)).toBe(batchLoads + 1);
  });

  it("won't submit without text, and says so", async () => {
    const fetchMock = stub();
    const { user, dialog } = await openDialog();

    await user.click(dialog.getByRole('button', { name: 'Submit feedback' }));

    const text = editor(dialog);
    expect(text).toHaveAccessibleDescription('Write your feedback before submitting.');
    expect(text).toHaveFocus();
    expect(sent(fetchMock, 'POST')).toEqual([]);
  });

  it('saves a blank draft without submitting it or refreshing the profile', async () => {
    const fetchMock = stub({ answer: { status: 201, body: entry() } });
    const { user, dialog } = await openDialog();
    const profileLoads = gets(fetchMock, `/api${profilePath}`);

    await user.click(dialog.getByRole('button', { name: 'Save draft' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent(fetchMock, 'POST')).toEqual([
      { period: '2026-10-01', body: '', colorCode: null, givesNotice: false },
    ]);
    expect(gets(fetchMock, `/api${profilePath}`)).toBe(profileLoads);
  });

  it("shows the API's refusal and keeps the text", async () => {
    stub({ answer: problem(503, 'unavailable', 'Server: 504 gateway timeout.') });
    const { user, dialog } = await openDialog();

    await user.type(editor(dialog), 'Good progress.');
    await user.click(dialog.getByRole('button', { name: 'Submit feedback' }));

    expect(await dialog.findByText("We couldn't submit your feedback")).toBeInTheDocument();
    expect(
      dialog.getByText(
        'Your text is still here. Try again in a moment. Server: 504 gateway timeout.',
      ),
    ).toBeInTheDocument();
    expect(editor(dialog)).toHaveValue('Good progress.');
  });

  it("says so when the batch hasn't started, and saves nothing", async () => {
    stub({ detail: batch({ startDate: '2026-12-07' }) });
    const { dialog } = await openDialog();

    expect(dialog.getByText('This batch starts in December 2026.')).toBeInTheDocument();
    expect(dialog.getByRole('combobox', { name: 'Feedback period' })).toHaveValue('2026-12-01');
    expect(dialog.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Submit feedback' })).toBeDisabled();
  });

  it('sends nothing on Cancel', async () => {
    const fetchMock = stub();
    const { user, dialog } = await openDialog();

    await user.type(editor(dialog), 'Unsaved');
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sent(fetchMock, 'POST')).toEqual([]);
  });
});

describe('an existing draft', () => {
  it('opens with its values and replaces it', async () => {
    const fetchMock = stubApi({
      [`PUT ${feedbackPath}/${draftId}`]: { status: 200, body: entry() },
    });
    const onClose = vi.fn<() => void>();
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <GiveFeedbackDialog
          intern={intern()}
          batch={batch()}
          open
          onClose={onClose}
          draft={entry({ givesNotice: true })}
        />
      </QueryClientProvider>,
    );
    const dialog = within(screen.getByRole('dialog', { name: 'Give feedback to Ishita Rao' }));

    expect(dialog.getByRole('combobox', { name: 'Feedback period' })).toHaveValue('2026-09-01');
    expect(dialog.getByRole('radio', { name: 'Orange' })).toBeChecked();
    expect(dialog.getByRole('switch', { name: 'Mark as notice' })).toBeChecked();
    expect(editor(dialog)).toHaveValue('Paired twice.');

    await user.type(editor(dialog), ' Asked early.');
    await user.click(dialog.getByRole('button', { name: 'Submit feedback' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent(fetchMock, 'PUT')).toEqual([
      {
        period: '2026-09-01',
        body: 'Paired twice. Asked early.',
        colorCode: 'orange',
        givesNotice: true,
        submit: true,
      },
    ]);
    expect(sent(fetchMock, 'POST')).toEqual([]);
  });
});
