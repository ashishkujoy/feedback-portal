import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiFetch } from '../api/api-fetch.ts';
import { meQuery } from '../api/me.ts';
import { renderApp } from '../test/render-app.tsx';
import { problem, type Reply, signedInWith, signedOut, stubApi } from '../test/stub-api.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const signInHeading = () => screen.findByRole('heading', { level: 1, name: 'Sign in' });
const mainNavLinks = async () =>
  within(await screen.findByRole('navigation', { name: 'Main' }))
    .getAllByRole('link')
    .map((link) => link.textContent);

describe('route guards', () => {
  it.each(['/batches', '/users', '/', '/nope'])(
    'sends a signed-out visit to %s to /login',
    async (path) => {
      stubApi(signedOut);
      const { router } = renderApp(path);

      expect(await signInHeading()).toBeVisible();
      expect(router.state.location.pathname).toBe('/login');
    },
  );

  it('sends a signed-in visit to /login to Batches', async () => {
    stubApi(signedInWith(['admin']));
    const { router } = renderApp('/login');

    expect(await screen.findByRole('heading', { level: 1, name: 'Batches' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/batches');
  });

  it.each([['mentor'], ['program_manager']] as const)(
    'sends a %s at /users to Batches',
    async (role) => {
      stubApi(signedInWith([role]));
      const { router } = renderApp('/users');

      await screen.findByRole('heading', { level: 1 });
      expect(router.state.location.pathname).toBe('/batches');
    },
  );
});

describe('the sign-in page', () => {
  it('offers Google sign-in through the API, with no message by default', async () => {
    stubApi(signedOut);
    renderApp('/login');

    expect(await signInHeading()).toBeVisible();
    expect(
      screen.getByText('Use the Test Org Google account an admin added for you.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Sign in with Google' })).toHaveAttribute(
      'href',
      '/api/auth/google',
    );
    expect(screen.queryByText("We couldn't sign you in")).toBeNull();
  });

  it.each(['sign_in_failed', 'something_else'])(
    'explains a failed sign-in (?error=%s)',
    async (error) => {
      stubApi(signedOut);
      renderApp(`/login?error=${error}`);

      await signInHeading();
      expect(screen.getByText("We couldn't sign you in")).toBeVisible();
      expect(
        screen.getByText(
          'Check you chose the right Google account, or ask an admin to add your email.',
        ),
      ).toBeVisible();
    },
  );

  it('says when Google sign-in is not set up', async () => {
    stubApi(signedOut);
    renderApp('/login?error=unavailable');

    await signInHeading();
    expect(screen.getByText("Google sign-in isn't set up")).toBeVisible();
    expect(screen.queryByText("We couldn't sign you in")).toBeNull();
  });
});

describe('navigation by role', () => {
  it('shows an admin Batches, My pending and Users and roles', async () => {
    stubApi(signedInWith(['admin']));
    renderApp('/batches');

    expect(await mainNavLinks()).toEqual(['Batches', 'My pending', 'Users and roles']);
  });

  it('shows a programme manager Batches and My pending', async () => {
    stubApi(signedInWith(['program_manager', 'mentor']));
    renderApp('/batches');

    expect(await mainNavLinks()).toEqual(['Batches', 'My pending']);
  });

  it('shows a mentor "My batches" in the nav, breadcrumb and title', async () => {
    stubApi(signedInWith(['mentor']));
    renderApp('/batches');

    expect(await screen.findByRole('heading', { level: 1, name: 'My batches' })).toBeVisible();
    expect(await mainNavLinks()).toEqual(['My batches', 'My pending']);
    const crumb = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText(
      'My batches',
    );
    expect(crumb).toHaveAttribute('aria-current', 'page');
  });
});

describe('signing out', () => {
  it('ends the session, forgets the user and goes to /login', async () => {
    const user = userEvent.setup();
    const replies: Record<string, Reply> = {
      ...signedInWith(['admin']),
      'POST /auth/logout': { status: 204 },
    };
    const fetchMock = stubApi(replies);
    const { router, queryClient } = renderApp('/batches');
    const signOut = await screen.findByRole('button', { name: 'Sign out' });
    replies['/me'] = problem(401, 'unauthenticated');

    await user.click(signOut);

    expect(await signInHeading()).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull();
    // Nothing of the previous user's is left; the names are reloaded for the sign-in page.
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual(expect.arrayContaining([['me'], ['settings']]));
    expect(queryClient.getQueryCache().getAll()).toHaveLength(2);
  });

  it('still signs the browser out when the API cannot be reached', async () => {
    const user = userEvent.setup();
    const replies = {
      ...signedInWith(['admin']),
      'POST /auth/logout': problem(503, 'unavailable'),
    };
    stubApi(replies);
    const { router } = renderApp('/batches');
    const signOut = await screen.findByRole('button', { name: 'Sign out' });

    await user.click(signOut);

    expect(await signInHeading()).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
  });
});

describe('a session that ends mid-use', () => {
  it('goes to /login when any request gets a 401', async () => {
    stubApi({ ...signedInWith(['admin']), '/users': problem(401, 'unauthenticated') });
    const { router, queryClient } = renderApp('/batches');
    await screen.findByRole('heading', { level: 1, name: 'Batches' });

    await queryClient
      .fetchQuery({
        queryKey: ['users'],
        queryFn: () => apiFetch('/users', { schema: z.unknown() }),
      })
      .catch(() => undefined);

    expect(await signInHeading()).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('goes to /login when a refetch of /me finds the session gone', async () => {
    const replies = signedInWith(['admin']);
    stubApi(replies);
    const { router, queryClient } = renderApp('/batches');
    await screen.findByRole('heading', { level: 1, name: 'Batches' });
    replies['/me'] = problem(401, 'unauthenticated');

    await queryClient.refetchQueries({ queryKey: meQuery.queryKey });

    expect(await signInHeading()).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
  });
});
