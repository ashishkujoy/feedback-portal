import type { BatchDetail, InternDetail, Role } from '@feedback-portal/contracts';
import { screen, waitFor, within } from '@testing-library/react';
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
const otherPm = { id: '01890a5d-ac96-774b-bcce-b30209000099', name: 'Oli Other', avatarUrl: null };

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
  phone: '+91 98450 12345',
  diplomaBranch: null,
  parentNames: null,
  interviewNotes: '### Technical round',
  source: 'manual',
  createdAt: '2026-07-07T09:00:00.000Z',
  addedBy: pat,
  statusEvents: [],
  ...overrides,
});

const base = `/batches/${batchId}/interns/${internId}`;

const stub = ({
  roles = ['program_manager'],
  detail = batch(),
  profile = intern(),
  saved = { status: 200, body: intern({ name: 'Ishita R.', phone: null }) },
}: Readonly<{
  roles?: [Role, ...Role[]];
  detail?: BatchDetail;
  profile?: InternDetail;
  saved?: Reply;
}> = {}) =>
  stubApi({
    ...signedInWith(roles),
    [`GET /batches/${batchId}`]: { status: 200, body: detail },
    [`GET ${base}`]: { status: 200, body: profile },
    [`GET /batches/${batchId}/interns`]: { status: 200, body: [] },
    [`PUT ${base}/details`]: saved,
  });

const open = async () => {
  const user = userEvent.setup();
  renderApp(`${base}?tab=details`);
  await screen.findByRole('heading', { level: 1, name: 'Ishita Rao' });
  return user;
};

const openDialog = async () => {
  const user = await open();
  await user.click(screen.getByRole('button', { name: 'Edit details' }));
  return { user, dialog: within(screen.getByRole('dialog', { name: 'Edit details' })) };
};

const puts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'PUT')
    .map(([, init]) => JSON.parse(typeof init?.body === 'string' ? init.body : ''));

describe('the Edit details button', () => {
  it("is on the Details card for the batch's PM", async () => {
    stub();
    await open();
    expect(
      within(screen.getByRole('region', { name: 'Details' })).getByRole('button', {
        name: 'Edit details',
      }),
    ).toBeInTheDocument();
  });

  it.each([
    ['a mentor', { roles: ['mentor'] as [Role], detail: batch({ programManager: otherPm }) }],
    ['a read-only intern', { profile: intern({ status: 'withdrawn' }) }],
    ['an archived batch', { detail: batch({ isArchived: true }) }],
  ])('is absent for %s', async (_case, options) => {
    stub(options);
    await open();
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
  });

  it('is there for an admin who is not the PM', async () => {
    stub({ roles: ['admin'], detail: batch({ programManager: otherPm }) });
    await open();
    expect(screen.getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
  });
});

describe('Edit details (A15)', () => {
  it('opens on the current details, with the username locked', async () => {
    stub();
    const { dialog } = await openDialog();

    expect(screen.getByText('Ishita Rao · Batch 2026')).toBeInTheDocument();
    const username = dialog.getByRole('textbox', { name: 'Username' });
    expect(username).toBeDisabled();
    expect(username).toHaveValue('ishita.rao');
    expect(username).toHaveAccessibleDescription(
      "Usernames can't change because imports match on them.",
    );
    expect(dialog.getByRole('textbox', { name: 'Full name' })).toHaveValue('Ishita Rao');
    expect(dialog.getByRole('textbox', { name: 'Full name' })).toHaveFocus();
    expect(dialog.getByRole('textbox', { name: 'Phone' })).toHaveValue('+91 98450 12345');
    expect(dialog.getByRole('textbox', { name: 'Diploma branch' })).toHaveValue('');
    expect(dialog.getByRole('textbox', { name: 'Interview notes' })).toHaveValue(
      '### Technical round',
    );
  });

  it('checks the fields before sending anything', async () => {
    const fetchMock = stub();
    const { user, dialog } = await openDialog();
    const email = dialog.getByRole('textbox', { name: 'Email' });

    await user.clear(email);
    await user.type(email, 'nope');
    await user.click(dialog.getByRole('button', { name: 'Save details' }));

    expect(email).toHaveAccessibleDescription('Invalid email address');
    expect(puts(fetchMock)).toEqual([]);
  });

  it('saves every field but the username, and shows the change', async () => {
    const fetchMock = stub();
    const { user, dialog } = await openDialog();
    const name = dialog.getByRole('textbox', { name: 'Full name' });
    await user.clear(name);
    await user.type(name, 'Ishita R.');
    await user.clear(dialog.getByRole('textbox', { name: 'Phone' }));

    await user.click(dialog.getByRole('button', { name: 'Save details' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(puts(fetchMock)).toEqual([
      {
        name: 'Ishita R.',
        email: 'ishita@example.com',
        phone: null,
        diplomaBranch: null,
        parentNames: null,
        interviewNotes: '### Technical round',
      },
    ]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Ishita R.' })).toBeInTheDocument();
  });

  it('marks the roster for a refresh, so it shows the change', async () => {
    const summary = {
      id: internId,
      batchId,
      username: 'ishita.rao',
      name: 'Ishita Rao',
      email: 'ishita@example.com',
      status: 'active',
      colorCode: null,
      noticeEndsOn: null,
      photoUrl: null,
    };
    stubApi({
      ...signedInWith(['program_manager']),
      [`GET /batches/${batchId}`]: { status: 200, body: batch() },
      [`GET ${base}`]: { status: 200, body: intern() },
      [`GET /batches/${batchId}/interns`]: { status: 200, body: [summary] },
      [`PUT ${base}/details`]: { status: 200, body: intern({ name: 'Ishita R.' }) },
    });
    const user = userEvent.setup();
    const { queryClient } = renderApp(`/batches/${batchId}`);
    await user.click(await screen.findByRole('link', { name: 'Ishita Rao' }));
    await user.click(await screen.findByRole('tab', { name: 'Details' }));
    await user.click(screen.getByRole('button', { name: 'Edit details' }));

    await user.click(
      within(screen.getByRole('dialog', { name: 'Edit details' })).getByRole('button', {
        name: 'Save details',
      }),
    );

    await waitFor(() =>
      expect(queryClient.getQueryState(['batches', batchId, 'interns'])?.isInvalidated).toBe(true),
    );
  });

  it("shows the API's refusal", async () => {
    stub({ saved: problem(409, 'intern_read_only') });
    const { user, dialog } = await openDialog();

    await user.click(dialog.getByRole('button', { name: 'Save details' }));

    expect(await dialog.findByText("We couldn't save these details")).toBeInTheDocument();
  });

  it('sends nothing on Cancel', async () => {
    const fetchMock = stub();
    const { user, dialog } = await openDialog();

    await user.click(dialog.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(puts(fetchMock)).toEqual([]);
  });
});
