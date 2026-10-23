import type { AdminUser } from '@feedback-portal/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app.tsx';
import { problem, type Reply, signedInWith, stubApi } from '../test/stub-api.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const ada: AdminUser = {
  id: '01890a5d-ac96-774b-bcce-b30209000001',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  avatarUrl: null,
  isActive: true,
  roles: ['admin'],
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const grace: AdminUser = {
  ...ada,
  id: '01890a5d-ac96-774b-bcce-b30209000002',
  email: 'grace@example.com',
  name: 'Grace Hopper',
  roles: ['admin', 'mentor'],
};

/**
 * `GET /users` lists Ada until `POST /users` has been answered with `postReply`; a 201 adds
 * Grace to the list from then on, as the API would.
 */
const stubUsers = (postReply: Reply = { status: 201, body: grace }) => {
  let added = false;
  return stubApi({
    ...signedInWith(['admin']),
    get 'GET /users'(): Reply {
      return { status: 200, body: added ? [ada, grace] : [ada] };
    },
    get 'POST /users'(): Reply {
      added = postReply.status === 201;
      return postReply;
    },
  });
};

type FetchMock = ReturnType<typeof stubApi>;

const posts = (fetchMock: FetchMock) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => (typeof init?.body === 'string' ? JSON.parse(init.body) : undefined));

const openDialog = async () => {
  const user = userEvent.setup();
  renderApp('/users');
  await screen.findByRole('cell', { name: /Ada Lovelace/ });
  const opener = screen.getByRole('button', { name: 'Add user' });
  await user.click(opener);
  const dialog = screen.getByRole('dialog', { name: 'Add user' });
  return { user, opener, dialog, form: within(dialog) };
};

describe('adding a user', () => {
  it('opens the dialog on the name field, with Mentor chosen', async () => {
    stubUsers();
    const { dialog, form } = await openDialog();

    expect(dialog).toHaveAccessibleDescription(
      'They sign in with their Test Org Google account, using this email.',
    );
    expect(form.getByLabelText('Full name')).toHaveFocus();
    expect(form.getByRole('checkbox', { name: 'Mentor' })).toBeChecked();
    expect(form.getByRole('checkbox', { name: 'Admin' })).not.toBeChecked();
    expect(form.getByRole('checkbox', { name: 'Programme manager' })).not.toBeChecked();
  });

  it('closes on Cancel or Escape without a request, and gives focus back', async () => {
    const fetchMock = stubUsers();
    const { user, opener, form } = await openDialog();

    await user.click(form.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(posts(fetchMock)).toEqual([]);
  });

  it('starts empty again after being closed', async () => {
    stubUsers();
    const { user, opener, form } = await openDialog();
    await user.type(form.getByLabelText('Full name'), 'Half typed');
    await user.click(form.getByRole('button', { name: 'Cancel' }));

    await user.click(opener);
    expect(within(screen.getByRole('dialog')).getByLabelText('Full name')).toHaveValue('');
  });

  it('checks the fields with the contract before sending anything', async () => {
    const fetchMock = stubUsers();
    const { user, form } = await openDialog();

    await user.click(form.getByRole('checkbox', { name: 'Mentor' }));
    await user.click(form.getByRole('button', { name: 'Add user' }));

    const name = form.getByLabelText('Full name');
    const email = form.getByLabelText('Email');
    expect(name).toHaveAccessibleDescription('Name is required');
    expect(name).toBeInvalid();
    expect(name).toHaveFocus();
    expect(email).toHaveAccessibleDescription('Invalid email address');
    expect(form.getByRole('group', { name: 'Roles' })).toHaveAccessibleDescription(
      'At least one role is required',
    );
    expect(posts(fetchMock)).toEqual([]);
  });

  it('re-checks a field as it is corrected', async () => {
    stubUsers();
    const { user, form } = await openDialog();
    await user.click(form.getByRole('button', { name: 'Add user' }));

    await user.type(form.getByLabelText('Full name'), 'Grace');
    expect(form.queryByText('Name is required')).not.toBeInTheDocument();
    expect(form.getByText('Invalid email address')).toBeInTheDocument();
  });

  it('adds the user, closes, and shows them in the list', async () => {
    const fetchMock = stubUsers();
    const { user, opener, form } = await openDialog();

    await user.type(form.getByLabelText('Full name'), '  Grace Hopper ');
    await user.type(form.getByLabelText('Email'), 'Grace@Example.COM');
    await user.click(form.getByRole('checkbox', { name: 'Admin' }));
    await user.click(form.getByRole('button', { name: 'Add user' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(posts(fetchMock)).toEqual([
      { name: 'Grace Hopper', email: 'grace@example.com', roles: ['admin', 'mentor'] },
    ]);
    expect(screen.getByRole('cell', { name: /Grace Hopper/ })).toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('shows a taken email under the email field and keeps what was typed', async () => {
    stubUsers(problem(409, 'email_taken'));
    const { user, form } = await openDialog();

    await user.type(form.getByLabelText('Full name'), 'Ada Again');
    await user.type(form.getByLabelText('Email'), 'ada@example.com');
    await user.click(form.getByRole('button', { name: 'Add user' }));

    const email = form.getByLabelText('Email');
    await waitFor(() => {
      expect(email).toHaveAccessibleDescription('A user with this email already exists.');
    });
    expect(email).toHaveFocus();
    expect(email).toHaveValue('ada@example.com');
    expect(form.getByLabelText('Full name')).toHaveValue('Ada Again');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows any other failure in the dialog', async () => {
    stubUsers(problem(500, 'internal'));
    const { user, form } = await openDialog();

    await user.type(form.getByLabelText('Full name'), 'Grace Hopper');
    await user.type(form.getByLabelText('Email'), 'grace@example.com');
    await user.click(form.getByRole('button', { name: 'Add user' }));

    expect(await form.findByText("We couldn't add this user")).toBeInTheDocument();
    expect(form.getByLabelText('Email')).toHaveValue('grace@example.com');
  });

  it('sends one request for a double click, and shows it is saving', async () => {
    const stubbed = stubUsers();
    // Hold the POST until both clicks have landed.
    const held = Promise.withResolvers<void>();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      if (init?.method === 'POST') await held.promise;
      return stubbed(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { user, form } = await openDialog();

    await user.type(form.getByLabelText('Full name'), 'Grace Hopper');
    await user.type(form.getByLabelText('Email'), 'grace@example.com');
    await user.dblClick(form.getByRole('button', { name: 'Add user' }));

    expect(await form.findByRole('button', { name: 'Adding…' })).toBeDisabled();
    held.resolve();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(posts(fetchMock)).toHaveLength(1);
  });
});
