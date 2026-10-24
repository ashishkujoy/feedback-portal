import type {
  BatchDetail,
  BatchMemberView,
  MentorCandidate,
  Role,
} from '@feedback-portal/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app.tsx';
import { problem, type Reply, signedInWith, stubApi, userWith } from '../test/stub-api.ts';
import { noInternCounts } from '../test/fixtures.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2027, 2, 1, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const batchId = '01890a5d-ac96-774b-bcce-b30209000001';
const me = userWith(['program_manager']);
const uid = (n: number) => `01890a5d-ac96-774b-bcce-b3020902${String(n).padStart(4, '0')}`;

const person = (n: number, name: string) => ({
  id: uid(n),
  name,
  email: `${name.split(' ')[0]?.toLowerCase() ?? 'x'}@example.com`,
  avatarUrl: null,
});

const ann = person(1, 'Ann Lee');
const bo = person(2, 'bo Chen');
const cy = person(3, 'Cy Diaz');
const di = person(4, 'Di Ek');

let rowId = 0;
const row = (
  who: ReturnType<typeof person>,
  role: BatchMemberView['role'],
  unassignedAt: string | null = null,
): BatchMemberView => {
  rowId += 1;
  return {
    id: `01890a5d-ac96-774b-bcce-b3020901${String(rowId).padStart(4, '0')}`,
    user: { ...who, isActive: true },
    role,
    assignedAt: '2027-01-12T09:00:00Z',
    unassignedAt,
  };
};

const pmRow = {
  ...row({ id: me.id, name: me.name, email: me.email, avatarUrl: null }, 'program_manager'),
};

const detail = (members: BatchMemberView[], overrides: Partial<BatchDetail> = {}): BatchDetail => ({
  id: batchId,
  name: 'Batch 2027',
  startDate: '2027-01-11',
  endDate: '2028-06-25',
  isArchived: false,
  programManager: { id: me.id, name: me.name, avatarUrl: null },
  mentorCount: members.filter((m) => m.role === 'mentor' && m.unassignedAt === null).length,
  interns: noInternCounts,
  mentors: [],
  members,
  ...overrides,
});

const before = detail([pmRow, row(ann, 'mentor'), row(cy, 'mentor')]);

const candidate = (
  who: ReturnType<typeof person>,
  isAssigned: boolean,
  otherBatches: MentorCandidate['otherBatches'] = [],
): MentorCandidate => ({ ...who, isActive: true, isAssigned, otherBatches });

const candidates = [
  candidate(di, false, [{ startDate: '2028-01-10', endDate: '2029-06-25' }]),
  candidate(cy, true),
  candidate(bo, false, [{ startDate: '2027-01-04', endDate: '2028-06-01' }]),
  candidate(ann, true),
];

const stub = (
  roles: [Role, ...Role[]],
  batch: BatchDetail = before,
  changes: Record<string, Reply> = {},
) =>
  stubApi({
    ...signedInWith(roles),
    [`GET /batches/${batchId}`]: { status: 200, body: batch },
    [`GET /batches/${batchId}/mentor-candidates`]: { status: 200, body: candidates },
    'GET /batches': { status: 200, body: [] },
    ...changes,
  });

const loaded = async () => {
  const user = userEvent.setup();
  renderApp(`/batches/${batchId}?tab=mentors`);
  await screen.findByRole('heading', { level: 1, name: 'Batch 2027' });
  return user;
};

const openDialog = async () => {
  const user = await loaded();
  await user.click(screen.getByRole('button', { name: 'Assign mentors' }));
  const dialog = screen.getByRole('dialog', { name: 'Assign mentors' });
  await within(dialog).findByRole('list', { name: 'Mentors' });
  return { user, dialog: within(dialog) };
};

const requests = (fetchMock: ReturnType<typeof stubApi>, method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([input, init]) => ({
      path: new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        location.href,
      ).pathname,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }));

/** The names in the Mentors table, without the avatars' initials (decorative). */
const mentorNames = () =>
  within(screen.getByRole('table', { name: 'Mentors' }))
    .getAllByRole('row')
    .slice(1)
    .map((tr) => tr.querySelector('.font-medium')?.textContent ?? '');

describe('who can manage mentors', () => {
  it("shows Assign mentors and Remove to the batch's PM", async () => {
    stub(['program_manager']);
    await loaded();

    expect(screen.getByRole('button', { name: 'Assign mentors' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Ann Lee' })).toBeInTheDocument();
  });

  it('shows them to an admin who is not the PM', async () => {
    stub(['admin'], detail(before.members, { programManager: { ...ann, id: uid(99) } }));
    await loaded();

    expect(screen.getByRole('button', { name: 'Assign mentors' })).toBeInTheDocument();
  });

  it('shows nothing to a mentor on the batch, or on an archived batch', async () => {
    stub(['mentor'], detail(before.members, { programManager: { ...ann, id: uid(99) } }));
    await loaded();
    expect(screen.queryByRole('button', { name: 'Assign mentors' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });

  it('shows nothing on an archived batch, even to its PM', async () => {
    stub(['program_manager'], detail(before.members, { isArchived: true }));
    await loaded();
    expect(screen.queryByRole('button', { name: 'Assign mentors' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });
});

describe('Assign mentors', () => {
  it("lists the batch's mentors first, ticked, then the others, each by name, with their load", async () => {
    stub(['program_manager']);
    const { dialog } = await openDialog();

    const boxes = dialog.getAllByRole('checkbox');
    expect(
      boxes.map((box) => [
        box.getAttribute('aria-label'),
        box instanceof HTMLInputElement && box.checked,
      ]),
    ).toEqual([
      ['Ann Lee', true],
      ['Cy Diaz', true],
      ['bo Chen', false],
      ['Di Ek', false],
    ]);
    expect(dialog.getByRole('checkbox', { name: 'bo Chen' })).toHaveAccessibleDescription(
      '1 active batch',
    );
    expect(dialog.getByRole('checkbox', { name: 'Di Ek' })).toHaveAccessibleDescription(
      '1 upcoming batch',
    );
    expect(dialog.getByRole('checkbox', { name: 'Ann Lee' })).toHaveAccessibleDescription(
      'Unassigned',
    );
    expect(dialog.getByText('2 selected')).toBeInTheDocument();
  });

  it('filters by name or email and keeps the ticks', async () => {
    stub(['program_manager']);
    const { user, dialog } = await openDialog();

    await user.click(dialog.getByRole('checkbox', { name: 'Di Ek' }));
    await user.type(dialog.getByRole('searchbox', { name: 'Search mentors' }), 'BO@');

    expect(dialog.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))).toEqual([
      'bo Chen',
    ]);
    await user.clear(dialog.getByRole('searchbox', { name: 'Search mentors' }));
    expect(dialog.getByRole('checkbox', { name: 'Di Ek' })).toBeChecked();
    expect(dialog.getByText('3 selected')).toBeInTheDocument();
  });

  it('enables Save only once something changes', async () => {
    stub(['program_manager']);
    const { user, dialog } = await openDialog();
    const save = dialog.getByRole('button', { name: 'Save mentors' });

    expect(save).toBeDisabled();
    await user.click(dialog.getByRole('checkbox', { name: 'bo Chen' }));
    expect(save).toBeEnabled();
    await user.click(dialog.getByRole('checkbox', { name: 'bo Chen' }));
    expect(save).toBeDisabled();
  });

  it('saves the whole set and shows the answer', async () => {
    const after = detail([
      pmRow,
      row(ann, 'mentor', '2027-03-01T10:00:00Z'),
      row(cy, 'mentor'),
      row(bo, 'mentor'),
    ]);
    const fetchMock = stub(['program_manager'], before, {
      [`PUT /batches/${batchId}/mentors`]: { status: 200, body: after },
    });
    const { user, dialog } = await openDialog();

    await user.click(dialog.getByRole('checkbox', { name: 'Ann Lee' }));
    await user.click(dialog.getByRole('checkbox', { name: 'bo Chen' }));
    await user.click(dialog.getByRole('button', { name: 'Save mentors' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(requests(fetchMock, 'PUT')).toEqual([
      { path: `/api/batches/${batchId}/mentors`, body: { userIds: [cy.id, bo.id] } },
    ]);
    expect(mentorNames()).toEqual(['Cy Diaz', 'bo Chen']);
    expect(screen.getByRole('table', { name: 'Past members' })).toHaveTextContent('Ann Lee');
  });

  it('shows a refusal and keeps the ticks', async () => {
    stub(['program_manager'], before, {
      [`PUT /batches/${batchId}/mentors`]: problem(409, 'member_role_mismatch'),
    });
    const { user, dialog } = await openDialog();

    await user.click(dialog.getByRole('checkbox', { name: 'Di Ek' }));
    await user.click(dialog.getByRole('button', { name: 'Save mentors' }));

    expect(await dialog.findByText("We couldn't save the mentors")).toBeInTheDocument();
    expect(dialog.getByRole('checkbox', { name: 'Di Ek' })).toBeChecked();
  });

  it('sends nothing on Cancel', async () => {
    const fetchMock = stub(['program_manager']);
    const { user, dialog } = await openDialog();

    await user.click(dialog.getByRole('checkbox', { name: 'Di Ek' }));
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests(fetchMock, 'PUT')).toEqual([]);
  });
});

describe('Remove', () => {
  it('unassigns the mentor at once; they move to Past members', async () => {
    const after = detail([pmRow, row(ann, 'mentor', '2027-03-01T10:00:00Z'), row(cy, 'mentor')]);
    const fetchMock = stub(['program_manager'], before, {
      [`DELETE /batches/${batchId}/mentors/${ann.id}`]: { status: 200, body: after },
    });
    const user = await loaded();

    await user.click(screen.getByRole('button', { name: 'Remove Ann Lee' }));

    await waitFor(() => {
      expect(mentorNames()).toEqual(['Cy Diaz']);
    });
    expect(requests(fetchMock, 'DELETE')).toEqual([
      { path: `/api/batches/${batchId}/mentors/${ann.id}`, body: undefined },
    ]);
    expect(screen.getByRole('table', { name: 'Past members' })).toHaveTextContent('Ann Lee');
  });
});
