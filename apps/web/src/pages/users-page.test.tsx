import type { AdminUser, Role } from '@feedback-portal/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app.tsx';
import { problem, type Reply, signedInWith, stubApi } from '../test/stub-api.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

let nextId = 0;
const adminUser = (
  name: string,
  roles: [Role, ...Role[]],
  overrides: Partial<AdminUser> = {},
): AdminUser => ({
  id: `01890a5d-ac96-774b-bcce-b30209${String(nextId++).padStart(6, '0')}`,
  email: `${name.split(' ')[0]?.toLowerCase() ?? 'x'}@example.com`,
  name,
  avatarUrl: null,
  isActive: true,
  roles,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const people = [
  adminUser('Ada Lovelace', ['admin', 'mentor']),
  adminUser('Alan Turing', ['mentor'], { isActive: false }),
  adminUser('Grace Hopper', ['mentor', 'program_manager']),
  adminUser('Linus Pauling', ['mentor']),
];

const withUsers = (reply: Reply = { status: 200, body: people }) => ({
  ...signedInWith(['admin']),
  '/users': reply,
});

const table = () => screen.getByRole('table', { name: 'Users' });
/** What a cell shows, without the avatar's initials (decorative, `aria-hidden`). */
const visibleText = (cell: HTMLElement) => {
  const copy = cell.cloneNode(true);
  if (!(copy instanceof HTMLElement)) throw new Error('expected an element');
  for (const hidden of copy.querySelectorAll('[aria-hidden]')) hidden.remove();
  return copy.textContent;
};
const loaded = () => screen.findByRole('cell', { name: /Ada Lovelace/ });
const rows = () =>
  within(table())
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').map(visibleText));
const tab = (name: RegExp) => screen.getByRole('tab', { name });

describe('the users page', () => {
  it('lists every user with email, roles (most privileged first) and inactive state', async () => {
    stubApi(withUsers());
    renderApp('/users');

    await loaded();
    expect(rows()).toEqual([
      ['Ada Lovelace', 'ada@example.com', 'Admin, Mentor'],
      ['Alan TuringInactive', 'alan@example.com', 'Mentor'],
      ['Grace Hopper', 'grace@example.com', 'Programme manager, Mentor'],
      ['Linus Pauling', 'linus@example.com', 'Mentor'],
    ]);
  });

  it('counts each role tab, with multi-role users in each of theirs', async () => {
    stubApi(withUsers());
    renderApp('/users');
    await loaded();

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'All4',
      'Admins1',
      'Programme managers1',
      'Mentors4',
    ]);
    expect(tab(/^All/)).toHaveAttribute('aria-selected', 'true');
  });

  it('filters by role tab and keeps it in the URL', async () => {
    const user = userEvent.setup();
    stubApi(withUsers());
    const { router } = renderApp('/users');
    await loaded();

    await user.click(tab(/^Programme managers/));

    expect(rows().map(([name]) => name)).toEqual(['Grace Hopper']);
    expect(router.state.location.search).toEqual({ role: 'program_manager' });
    expect(tab(/^Programme managers/)).toHaveAttribute('aria-selected', 'true');
  });

  it('searches by name or email and keeps it in the URL', async () => {
    const user = userEvent.setup();
    stubApi(withUsers());
    const { router } = renderApp('/users');
    await loaded();

    await user.type(screen.getByRole('searchbox', { name: 'Search users' }), 'GRACE@');

    expect(rows().map(([name]) => name)).toEqual(['Grace Hopper']);
    expect(router.state.location.search).toEqual({ q: 'GRACE@' });
  });

  it('replaces the history entry while typing, so Back leaves the page', async () => {
    const user = userEvent.setup();
    stubApi(withUsers());
    const { router } = renderApp('/batches');
    await user.click(await screen.findByRole('link', { name: 'Users and roles' }));
    await loaded();

    await user.type(screen.getByRole('searchbox', { name: 'Search users' }), 'gra');
    router.history.back();

    expect(await screen.findByRole('heading', { level: 1, name: 'Batches' })).toBeVisible();
  });

  it('restores the tab and search from the URL', async () => {
    stubApi(withUsers());
    renderApp('/users?role=mentor&q=tur');

    await screen.findByRole('cell', { name: /Alan Turing/ });
    expect(within(table()).getAllByRole('row')).toHaveLength(2);
    expect(tab(/^Mentors/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('searchbox', { name: 'Search users' })).toHaveValue('tur');
  });

  it('ignores an unknown role in the URL', async () => {
    stubApi(withUsers());
    renderApp('/users?role=owner');

    await loaded();
    expect(rows()).toHaveLength(4);
    expect(tab(/^All/)).toHaveAttribute('aria-selected', 'true');
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup();
    stubApi(withUsers());
    renderApp('/users');
    await loaded();

    await user.type(screen.getByRole('searchbox', { name: 'Search users' }), 'nobody');

    expect(await screen.findByText('No users match your search.')).toBeVisible();
  });

  it('shows a callout when the users cannot be loaded', async () => {
    stubApi(withUsers(problem(500, 'internal')));
    renderApp('/users');

    // A 5xx is retried once (about a second) before the page gives up.
    expect(
      await screen.findByText("We couldn't load users", undefined, { timeout: 3000 }),
    ).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('moves between tabs with the arrow keys', async () => {
    const user = userEvent.setup();
    stubApi(withUsers());
    renderApp('/users');
    await loaded();

    tab(/^All/).focus();
    await user.keyboard('{ArrowRight}');
    expect(tab(/^Admins/)).toHaveFocus();
    expect(tab(/^Admins/)).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(tab(/^Mentors/)).toHaveFocus();
    expect(tab(/^All/)).toHaveAttribute('tabindex', '-1');
  });
});

describe('who can see it', () => {
  it.each([['mentor'], ['program_manager']] as const)(
    'sends a %s to Batches without asking for the users',
    async (role) => {
      const fetchMock = stubApi({ ...signedInWith([role]), '/users': { status: 200, body: [] } });
      const { router } = renderApp('/users');

      await screen.findByRole('heading', { level: 1, name: /batches/i });
      expect(router.state.location.pathname).toBe('/batches');
      expect(fetchMock.mock.calls.map(([input]) => input)).not.toContain('/api/users');
    },
  );
});
