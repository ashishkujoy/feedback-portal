import type {
  BatchDetail,
  InternDetail,
  InternStatusEvent,
  Role,
} from '@feedback-portal/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app.tsx';
import { noInternCounts } from '../test/fixtures.ts';
import { problem, type Reply, signedInWith, stubApi, userWith } from '../test/stub-api.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 24, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const batchId = '01890a5d-ac96-774b-bcce-b30209000001';
const internId = '01890a5d-ac96-774b-bcce-b30209000002';
const me = userWith(['program_manager']);
const pat = { id: me.id, name: me.name };

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

const graduated = intern({
  status: 'graduated',
  statusEvents: [
    {
      ...onboarding,
      id: '01890a5d-ac96-774b-bcce-b30209000011',
      fromStatus: 'active',
      toStatus: 'graduated',
      reason: 'Completed all milestones.',
      createdAt: '2026-10-24T10:00:00.000Z',
    },
    onboarding,
  ],
});

const changePath = `POST /batches/${batchId}/interns/${internId}/status-changes`;

const stub = ({
  roles = ['program_manager'],
  detail = batch(),
  profile = intern(),
  answer = { status: 200, body: graduated },
}: Readonly<{
  roles?: [Role, ...Role[]];
  detail?: BatchDetail;
  profile?: InternDetail;
  answer?: Reply;
}> = {}) =>
  stubApi({
    ...signedInWith(roles),
    [`GET /batches/${batchId}`]: { status: 200, body: detail },
    [`GET /batches/${batchId}/interns/${internId}`]: { status: 200, body: profile },
    [changePath]: answer,
  });

const open = async () => {
  const user = userEvent.setup();
  renderApp(`/batches/${batchId}/interns/${internId}`);
  await screen.findByRole('heading', { level: 1, name: 'Ishita Rao' });
  return user;
};

const headerButtons = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.textContent)
    .filter((text) => ['Withdraw', 'Graduate', 'Terminate', 'Lift notice'].includes(text ?? ''));

const posts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => (typeof init?.body === 'string' ? JSON.parse(init.body) : undefined));

describe('the status buttons', () => {
  it("are v2's for the batch's PM: active, then on notice", async () => {
    stub();
    await open();
    expect(headerButtons()).toEqual(['Withdraw', 'Graduate']);
  });

  it('include Terminate and Lift notice while on notice', async () => {
    stub({ profile: intern({ status: 'on_notice', noticeEndsOn: '2026-11-08' }) });
    await open();
    expect(headerButtons()).toEqual(['Withdraw', 'Terminate', 'Lift notice']);
  });

  it.each([
    [
      'an admin who is not the PM',
      {
        roles: ['admin'] as [Role],
        detail: batch({
          programManager: {
            id: '01890a5d-ac96-774b-bcce-b30209000099',
            name: 'Oli',
            avatarUrl: null,
          },
        }),
      },
    ],
    [
      'a mentor',
      {
        roles: ['mentor'] as [Role],
        detail: batch({
          programManager: {
            id: '01890a5d-ac96-774b-bcce-b30209000099',
            name: 'Oli',
            avatarUrl: null,
          },
        }),
      },
    ],
    ['an archived batch', { detail: batch({ isArchived: true }) }],
    ['a final intern', { profile: graduated }],
  ])('are absent for %s', async (_case, options) => {
    stub(options);
    await open();
    expect(headerButtons()).toEqual([]);
  });
});

describe('the status dialog', () => {
  it('explains the change and asks for a reason', async () => {
    const fetchMock = stub();
    const user = await open();

    await user.click(screen.getByRole('button', { name: 'Graduate' }));

    const dialog = within(screen.getByRole('dialog', { name: 'Graduate Ishita Rao' }));
    expect(screen.getByText('Use this when Ishita completes the programme.')).toBeInTheDocument();
    expect(dialog.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      "The status changes to Graduated. This can't be undone.",
      'The record becomes read-only.',
    ]);
    const reason = dialog.getByRole('textbox', { name: 'Reason' });
    expect(reason).toHaveFocus();
    expect(reason).toHaveAccessibleDescription('Markdown supported. Kept in the status history.');

    await user.click(dialog.getByRole('button', { name: 'Graduate' }));

    expect(reason).toHaveAccessibleDescription('Add a reason.');
    expect(posts(fetchMock)).toEqual([]);
  });

  it('makes the change and shows the result', async () => {
    const fetchMock = stub();
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Graduate' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Graduate Ishita Rao' }));

    await user.type(dialog.getByRole('textbox', { name: 'Reason' }), 'Completed all milestones.');
    await user.click(dialog.getByRole('button', { name: 'Graduate' }));

    expect(
      await screen.findByText('This intern graduated on 24 Oct 2026. Their record is read-only.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(headerButtons()).toEqual([]);
    expect(posts(fetchMock)).toEqual([{ action: 'graduate', reason: 'Completed all milestones.' }]);
  });

  it("shows the API's refusal and keeps the reason", async () => {
    stub({ answer: problem(409, 'intern_read_only') });
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Withdraw' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Withdraw Ishita Rao' }));

    await user.type(dialog.getByRole('textbox', { name: 'Reason' }), 'Left');
    await user.click(dialog.getByRole('button', { name: 'Withdraw' }));

    expect(await dialog.findByText("We couldn't withdraw Ishita Rao")).toBeInTheDocument();
    expect(dialog.getByRole('textbox', { name: 'Reason' })).toHaveValue('Left');
  });

  it('uses the destructive button for Terminate', async () => {
    stub({ profile: intern({ status: 'on_notice', noticeEndsOn: '2026-11-08' }) });
    const user = await open();

    await user.click(screen.getByRole('button', { name: 'Terminate' }));

    const dialog = within(screen.getByRole('dialog', { name: 'Terminate Ishita Rao?' }));
    expect(dialog.getByRole('button', { name: 'Terminate intern' }).className).toMatch(
      /destructive/,
    );
  });

  it('sends nothing on Cancel', async () => {
    const fetchMock = stub();
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Graduate' }));

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(posts(fetchMock)).toEqual([]);
  });
});
