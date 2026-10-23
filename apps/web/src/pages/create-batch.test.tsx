import type { AdminUser, BatchDetail, Role } from '@feedback-portal/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app.tsx';
import { problem, type Reply, signedInWith, stubApi } from '../test/stub-api.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const user = (n: number, name: string, roles: [Role, ...Role[]], isActive = true): AdminUser => ({
  id: `01890a5d-ac96-774b-bcce-b3020900${String(n).padStart(4, '0')}`,
  email: `${name.split(' ')[0]?.toLowerCase() ?? 'x'}@example.com`,
  name,
  avatarUrl: null,
  isActive,
  roles,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const zed = user(1, 'Zed Manager', ['program_manager']);
const amy = user(2, 'amy Manager', ['program_manager', 'mentor']);
const gone = user(3, 'Gone Manager', ['program_manager'], false);
const mo = user(4, 'Mo Mentor', ['mentor']);

const created: BatchDetail = {
  id: '01890a5d-ac96-774b-bcce-b30209000099',
  name: 'Batch 2027',
  startDate: '2027-01-11',
  endDate: '2028-07-11',
  isArchived: false,
  programManager: { id: amy.id, name: amy.name, avatarUrl: null },
  mentorCount: 0,
  mentors: [],
  members: [
    {
      id: '01890a5d-ac96-774b-bcce-b30209000100',
      user: { id: amy.id, name: amy.name, email: amy.email, avatarUrl: null, isActive: true },
      role: 'program_manager',
      assignedAt: '2027-01-11T09:00:00.000Z',
      unassignedAt: null,
    },
  ],
};

const stubCreate = (reply: Reply = { status: 201, body: created }) =>
  stubApi({
    ...signedInWith(['admin']),
    'GET /batches': { status: 200, body: [] },
    'GET /users': { status: 200, body: [zed, amy, gone, mo] },
    'POST /batches': reply,
    [`GET /batches/${created.id}`]: { status: 200, body: created },
  });

const posts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => (typeof init?.body === 'string' ? JSON.parse(init.body) : undefined));

const openDialog = async () => {
  const actor = userEvent.setup();
  const app = renderApp('/batches');
  await actor.click(await screen.findByRole('button', { name: 'Create batch' }));
  const dialog = screen.getByRole('dialog', { name: 'Create batch' });
  return { actor, app, form: within(dialog) };
};

describe('creating a batch', () => {
  it('lists only active programme managers, by name', async () => {
    stubCreate();
    const { form } = await openDialog();

    const select = form.getByLabelText('Programme manager');
    await waitFor(() => {
      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Choose a programme manager', 'amy Manager', 'Zed Manager']);
    });
    expect(form.getByLabelText('Batch name')).toHaveFocus();
  });

  it('fills the end date 18 months after the start, if it is empty', async () => {
    stubCreate();
    const { actor, form } = await openDialog();

    await actor.type(form.getByLabelText('Start date'), '2027-01-11');

    expect(form.getByLabelText('End date')).toHaveValue('2028-07-11');
  });

  it('leaves an end date that was already chosen', async () => {
    stubCreate();
    const { actor, form } = await openDialog();

    await actor.type(form.getByLabelText('End date'), '2028-01-31');
    await actor.type(form.getByLabelText('Start date'), '2027-01-11');

    expect(form.getByLabelText('End date')).toHaveValue('2028-01-31');
  });

  it('checks the fields before sending anything', async () => {
    const fetchMock = stubCreate();
    const { actor, form } = await openDialog();

    await actor.click(form.getByRole('button', { name: 'Create batch' }));

    expect(form.getByLabelText('Batch name')).toHaveAccessibleDescription('Name is required');
    expect(form.getByLabelText('Start date')).toHaveAccessibleDescription(
      'Start date must be a valid date',
    );
    expect(form.getByLabelText('Programme manager')).toHaveAccessibleDescription(
      'Choose a programme manager',
    );
    expect(posts(fetchMock)).toEqual([]);
  });

  it('creates the batch and opens it', async () => {
    const fetchMock = stubCreate();
    const { actor, app, form } = await openDialog();

    await actor.type(form.getByLabelText('Batch name'), '  Batch 2027 ');
    await actor.type(form.getByLabelText('Start date'), '2027-01-11');
    await waitFor(() => {
      expect(within(form.getByLabelText('Programme manager')).getAllByRole('option')).toHaveLength(
        3,
      );
    });
    await actor.selectOptions(form.getByLabelText('Programme manager'), 'amy Manager');
    await actor.click(form.getByRole('button', { name: 'Create batch' }));

    await waitFor(() => {
      expect(app.router.state.location.pathname).toBe(`/batches/${created.id}`);
    });
    expect(posts(fetchMock)).toEqual([
      {
        name: 'Batch 2027',
        startDate: '2027-01-11',
        endDate: '2028-07-11',
        programManagerId: amy.id,
      },
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Batch 2027' }),
    ).toBeInTheDocument();
  });

  it('shows a name already taken under the name', async () => {
    stubCreate(problem(409, 'batch_name_taken'));
    const { actor, form } = await openDialog();

    await actor.type(form.getByLabelText('Batch name'), 'Batch 2027');
    await actor.type(form.getByLabelText('Start date'), '2027-01-11');
    await waitFor(() => {
      expect(within(form.getByLabelText('Programme manager')).getAllByRole('option')).toHaveLength(
        3,
      );
    });
    await actor.selectOptions(form.getByLabelText('Programme manager'), 'Zed Manager');
    await actor.click(form.getByRole('button', { name: 'Create batch' }));

    const name = form.getByLabelText('Batch name');
    await waitFor(() => {
      expect(name).toHaveAccessibleDescription('A batch with this name already exists.');
    });
    expect(name).toHaveFocus();
  });

  it('shows any other failure in the dialog', async () => {
    stubCreate(problem(500, 'internal'));
    const { actor, form } = await openDialog();

    await actor.type(form.getByLabelText('Batch name'), 'Batch 2027');
    await actor.type(form.getByLabelText('Start date'), '2027-01-11');
    await waitFor(() => {
      expect(within(form.getByLabelText('Programme manager')).getAllByRole('option')).toHaveLength(
        3,
      );
    });
    await actor.selectOptions(form.getByLabelText('Programme manager'), 'Zed Manager');
    await actor.click(form.getByRole('button', { name: 'Create batch' }));

    expect(await form.findByText("We couldn't create this batch")).toBeInTheDocument();
  });
});
