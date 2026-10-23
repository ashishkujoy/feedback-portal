import type { AdminUser, Role } from '@feedback-portal/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app.tsx';
import { problem, type Reply, signedInWith, stubApi, userWith } from '../test/stub-api.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const person = (n: number, name: string, roles: [Role, ...Role[]], isActive = true): AdminUser => ({
  id: `01890a5d-ac96-774b-bcce-b30209${String(n).padStart(6, '0')}`,
  email: `${name.split(' ')[0]?.toLowerCase() ?? 'x'}@example.com`,
  name,
  avatarUrl: null,
  isActive,
  roles,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
});

/** The signed-in admin is Ada (same id as `/me`). */
const ada = { ...person(0, 'Ada Lovelace', ['admin']), id: userWith(['admin']).id };
const alan = person(1, 'Alan Turing', ['program_manager', 'mentor'], false);
const grace = person(2, 'Grace Hopper', ['mentor']);

/**
 * `GET /users` lists the three; the change endpoints answer from `changes` (a reply, or the
 * updated user as the API would return it).
 */
const stubUsers = (changes: Record<string, Reply> = {}) =>
  stubApi({
    ...signedInWith(['admin']),
    'GET /users': { status: 200, body: [ada, alan, grace] },
    ...changes,
  });

type FetchMock = ReturnType<typeof stubApi>;

const requests = (fetchMock: FetchMock) =>
  fetchMock.mock.calls
    .map(([input, init]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(url, location.href).pathname.replace(/^\/api/, '');
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      return { method: init?.method ?? 'GET', path, body };
    })
    .filter(({ path }) => path.startsWith('/users'));

const loaded = async () => {
  const user = userEvent.setup();
  renderApp('/users');
  await screen.findByRole('cell', { name: /Ada Lovelace/ });
  return user;
};

const rolesOf = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^Roles for ${name}: `) });
const tab = (name: RegExp) => screen.getByRole('tab', { name });

describe('editing roles', () => {
  it('saves a toggled role at once and shows the answer without reloading the list', async () => {
    const fetchMock = stubUsers({
      [`PUT /users/${grace.id}/roles`]: {
        status: 200,
        body: { ...grace, roles: ['program_manager', 'mentor'] },
      },
    });
    const user = await loaded();
    expect(tab(/Programme managers/)).toHaveTextContent('1');

    await user.click(rolesOf('Grace Hopper'));
    await user.click(screen.getByRole('checkbox', { name: 'Programme manager' }));

    await waitFor(() => {
      expect(rolesOf('Grace Hopper')).toHaveAccessibleName(
        'Roles for Grace Hopper: Programme manager, Mentor',
      );
    });
    expect(tab(/Programme managers/)).toHaveTextContent('2');
    expect(requests(fetchMock)).toEqual([
      { method: 'GET', path: '/users', body: undefined },
      {
        method: 'PUT',
        path: `/users/${grace.id}/roles`,
        body: { roles: ['program_manager', 'mentor'] },
      },
    ]);
  });

  it('sends the remaining roles when one is unticked', async () => {
    const fetchMock = stubUsers({
      [`PUT /users/${alan.id}/roles`]: {
        status: 200,
        body: { ...alan, roles: ['program_manager'] },
      },
    });
    const user = await loaded();

    await user.click(rolesOf('Alan Turing'));
    await user.click(screen.getByRole('checkbox', { name: 'Mentor' }));

    await waitFor(() => {
      expect(rolesOf('Alan Turing')).toHaveAccessibleName(
        'Roles for Alan Turing: Programme manager',
      );
    });
    expect(requests(fetchMock).filter((r) => r.method === 'PUT')).toEqual([
      { method: 'PUT', path: `/users/${alan.id}/roles`, body: { roles: ['program_manager'] } },
    ]);
  });

  it("won't let you remove your own admin role, or remove yourself", async () => {
    stubUsers();
    const user = await loaded();

    await user.click(rolesOf('Ada Lovelace'));
    const admin = screen.getByRole('checkbox', { name: 'Admin' });
    expect(admin).toBeDisabled();
    expect(admin).toHaveAccessibleDescription("You can't remove your own admin role");
    expect(screen.queryByRole('button', { name: 'Remove Ada Lovelace' })).not.toBeInTheDocument();
  });

  it("won't let a user's only role be removed", async () => {
    stubUsers();
    const user = await loaded();

    await user.click(rolesOf('Grace Hopper'));
    const mentor = screen.getByRole('checkbox', { name: 'Mentor' });
    expect(mentor).toBeDisabled();
    expect(mentor).toHaveAccessibleDescription(
      'A user needs at least one role; remove them instead',
    );
  });

  it('shows what the API refuses, with its reason', async () => {
    const fetchMock = stubUsers({
      [`PUT /users/${grace.id}/roles`]: {
        ...problem(409, 'last_admin'),
        body: {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          code: 'last_admin',
          detail: 'At least one active admin is required',
          requestId: 'req-1',
        },
      },
    });
    const user = await loaded();

    await user.click(rolesOf('Grace Hopper'));
    await user.click(screen.getByRole('checkbox', { name: 'Admin' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't update Grace Hopper");
    expect(alert).toHaveTextContent('At least one active admin is required');
    expect(rolesOf('Grace Hopper')).toHaveAccessibleName('Roles for Grace Hopper: Mentor');
    // The list is reloaded, in case someone else changed it.
    await waitFor(() => {
      expect(requests(fetchMock).filter((r) => r.method === 'GET')).toHaveLength(2);
    });
  });

  it('blocks the row while a change is saving', async () => {
    const stubbed = stubUsers({
      [`PUT /users/${grace.id}/roles`]: {
        status: 200,
        body: { ...grace, roles: ['admin', 'mentor'] },
      },
    });
    const held = Promise.withResolvers<void>();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (init?.method === 'PUT') await held.promise;
        return stubbed(input, init);
      }),
    );
    const user = await loaded();

    await user.click(rolesOf('Grace Hopper'));
    await user.click(screen.getByRole('checkbox', { name: 'Admin' }));

    expect(screen.getByRole('group', { name: 'Roles for Grace Hopper' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Remove Grace Hopper' })).toBeDisabled();
    held.resolve();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove Grace Hopper' })).toBeEnabled();
    });
  });
});

describe('removing and reactivating', () => {
  it('asks first, then deactivates and offers Reactivate', async () => {
    const fetchMock = stubUsers({
      [`POST /users/${grace.id}/deactivate`]: { status: 200, body: { ...grace, isActive: false } },
    });
    const user = await loaded();
    const remove = screen.getByRole('button', { name: 'Remove Grace Hopper' });

    await user.click(remove);
    const dialog = screen.getByRole('dialog', { name: 'Remove Grace Hopper?' });
    expect(dialog).toHaveAccessibleDescription(
      "They're signed out and can't sign in. Their feedback and comments stay, and you can add them back.",
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(requests(fetchMock).filter((r) => r.method === 'POST')).toEqual([]);

    await user.click(remove);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('cell', { name: /Grace Hopper/ })).toHaveTextContent('Inactive');
    const reactivate = screen.getByRole('button', { name: 'Reactivate Grace Hopper' });
    expect(reactivate).toHaveFocus();
    expect(requests(fetchMock).filter((r) => r.method === 'POST')).toEqual([
      { method: 'POST', path: `/users/${grace.id}/deactivate`, body: undefined },
    ]);
  });

  it('reactivates at once, without asking', async () => {
    const fetchMock = stubUsers({
      [`POST /users/${alan.id}/reactivate`]: { status: 200, body: { ...alan, isActive: true } },
    });
    const user = await loaded();

    await user.click(screen.getByRole('button', { name: 'Reactivate Alan Turing' }));

    await waitFor(() => {
      expect(screen.getByRole('cell', { name: /Alan Turing/ })).not.toHaveTextContent('Inactive');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Alan Turing' })).toBeInTheDocument();
    expect(requests(fetchMock).filter((r) => r.method === 'POST')).toEqual([
      { method: 'POST', path: `/users/${alan.id}/reactivate`, body: undefined },
    ]);
  });
});
