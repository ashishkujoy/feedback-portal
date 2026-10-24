import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app.tsx';
import { problem, signedInWith, signedOut, stubApi, testSettings } from '../test/stub-api.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  document.title = '';
});

const sidebar = () => screen.findByRole('complementary');
const settingsCalls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([input]) => input === '/api/settings');

describe('branding from /settings', () => {
  it('shows the program name above "Mentor portal" in the sidebar', async () => {
    stubApi(signedInWith(['admin']));
    renderApp('/batches');

    const brand = within(await sidebar());
    const name = brand.getByText(testSettings.programName);
    expect(name.nextElementSibling).toHaveTextContent('Mentor portal');
  });

  it('shows the program name on the sign-in card, and the org in the hint', async () => {
    stubApi(signedOut);
    renderApp('/login');

    await screen.findByRole('heading', { level: 1, name: 'Sign in' });
    expect(screen.getByText(testSettings.programName)).toBeVisible();
    expect(
      screen.getByText(`Use the ${testSettings.orgName} Google account an admin added for you.`),
    ).toBeVisible();
  });

  it('names the browser tab after the program', async () => {
    stubApi(signedOut);
    renderApp('/login');

    await vi.waitFor(() => {
      expect(document.title).toBe(`${testSettings.programName} · Mentor portal`);
    });
  });

  it('shows whatever names the API is configured with', async () => {
    stubApi({
      ...signedOut,
      '/settings': {
        status: 200,
        body: { programName: 'Other Programme', orgName: 'Other Org', photos: false },
      },
    });
    renderApp('/login');

    expect(await screen.findByText('Other Programme')).toBeVisible();
    expect(screen.queryByText(testSettings.programName)).not.toBeInTheDocument();
    expect(
      screen.getByText('Use the Other Org Google account an admin added for you.'),
    ).toBeVisible();
  });

  it('still works without names when /settings fails', async () => {
    stubApi({ ...signedInWith(['admin']), '/settings': problem(503, 'unavailable') });
    renderApp('/batches');

    expect(await screen.findByRole('heading', { level: 1, name: 'Batches' })).toBeVisible();
    expect(within(await sidebar()).queryByText(testSettings.programName)).not.toBeInTheDocument();
    expect(within(await sidebar()).getByText('Mentor portal')).toBeVisible();
  });

  it('uses the generic sign-in hint when /settings fails', async () => {
    stubApi({ ...signedOut, '/settings': problem(503, 'unavailable') });
    renderApp('/login');

    await screen.findByRole('heading', { level: 1, name: 'Sign in' });
    expect(screen.getByText('Use the Google account an admin added for you.')).toBeVisible();
  });

  it('fetches /settings once while moving between pages', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi(signedInWith(['admin']));
    renderApp('/batches');

    await user.click(await screen.findByRole('link', { name: 'Users and roles' }));
    await screen.findByRole('heading', { level: 1, name: 'Users and roles' });
    await user.click(screen.getByRole('link', { name: 'Batches' }));
    await screen.findByRole('heading', { level: 1, name: 'Batches' });

    expect(settingsCalls(fetchMock)).toHaveLength(1);
  });
});
