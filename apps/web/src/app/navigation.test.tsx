import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app.tsx';
import { signedInWith, stubApi } from '../test/stub-api.ts';

beforeEach(() => {
  stubApi(signedInWith(['admin']));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const mainNav = () => screen.getByRole('navigation', { name: 'Main' });
const breadcrumb = () => screen.getByRole('navigation', { name: 'Breadcrumb' });
const currentNavItem = () =>
  within(mainNav())
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page')
    .map((link) => link.textContent);

const expectPage = async (title: string) => {
  expect(await screen.findByRole('heading', { level: 1, name: title })).toBeVisible();
  expect(within(breadcrumb()).getByText(title)).toHaveAttribute('aria-current', 'page');
};

describe('navigation', () => {
  it('redirects / to Batches and marks it active', async () => {
    const { router } = renderApp('/');

    await expectPage('Batches');
    expect(router.state.location.pathname).toBe('/batches');
    expect(currentNavItem()).toEqual(['Batches']);
  });

  it('moves between pages from the sidebar, and back', async () => {
    const user = userEvent.setup();
    const { router, history } = renderApp('/batches');
    await expectPage('Batches');

    await user.click(within(mainNav()).getByRole('link', { name: 'Users and roles' }));

    await expectPage('Users and roles');
    expect(router.state.location.pathname).toBe('/users');
    expect(currentNavItem()).toEqual(['Users and roles']);

    history.back();
    await expectPage('Batches');
    expect(currentNavItem()).toEqual(['Batches']);
  });

  it('shows not found inside the shell, with a way back', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/nope');

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    expect(mainNav()).toBeVisible();
    expect(currentNavItem()).toEqual([]);

    await user.click(screen.getByRole('link', { name: 'Go to batches' }));
    await expectPage('Batches');
    expect(router.state.location.pathname).toBe('/batches');
  });

  it('has one main landmark holding the page', async () => {
    renderApp('/users');
    await expectPage('Users and roles');

    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1 })).toHaveTextContent('Users and roles');
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});
