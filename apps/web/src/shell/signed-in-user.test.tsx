import type { MeResponse } from '@feedback-portal/contracts';
import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app.tsx';
import { signedOut, stubApi } from '../test/stub-api.ts';

const me = (overrides: Partial<MeResponse> = {}): MeResponse => ({
  id: '01890a5d-ac96-774b-bcce-b302099a8057',
  email: 'someone@example.com',
  name: 'Ada Lovelace',
  avatarUrl: null,
  roles: ['admin'],
  ...overrides,
});

const signedInAs = (user: MeResponse) => stubApi({ '/me': { status: 200, body: user } });
const sidebar = () => screen.getByRole('complementary');
/** Waits for the router to render, then for `/me` to fill the sidebar. */
const userIn = async (name: string) =>
  within(await screen.findByRole('complementary')).findByText(name);
const topBar = () => screen.getByRole('banner');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the signed-in user in the shell', () => {
  it('shows an admin with initials, name, role and "Viewing as Admin"', async () => {
    signedInAs(me());
    renderApp('/batches');

    expect(await userIn('Ada Lovelace')).toBeVisible();
    expect(within(sidebar()).getByText('AL')).toBeVisible();
    expect(within(sidebar()).getByText('Admin')).toBeVisible();
    expect(within(topBar()).getByText('Viewing as')).toHaveTextContent('Viewing asAdmin');
  });

  it('shows the Google photo when there is one', async () => {
    signedInAs(me({ avatarUrl: 'https://example.com/ada.png' }));
    renderApp('/batches');

    await userIn('Ada Lovelace');
    const photo = sidebar().querySelector('img');
    expect(photo).toHaveAttribute('src', 'https://example.com/ada.png');
    expect(photo).toHaveAttribute('alt', '');
    expect(within(sidebar()).queryByText('AL')).toBeNull();
  });

  it('shows someone with several roles as the most privileged one', async () => {
    signedInAs(me({ name: 'Grace', roles: ['mentor', 'program_manager'] }));
    renderApp('/batches');

    expect(await userIn('Programme manager')).toBeVisible();
    expect(within(sidebar()).getByText('G')).toBeVisible();
    expect(within(topBar()).getByText('Viewing as')).toHaveTextContent('Programme manager');
  });

  it('shows neither block when signed out, and the page still renders', async () => {
    const fetchMock = stubApi(signedOut);
    renderApp('/batches');

    expect(await screen.findByRole('heading', { level: 1, name: 'Batches' })).toBeVisible();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me', expect.anything());
    });
    expect(within(topBar()).queryByText('Viewing as')).toBeNull();
    expect(sidebar().querySelector('img, .rounded-full')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // a 401 is not retried
  });
});
