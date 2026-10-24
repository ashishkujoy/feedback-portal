import type { BatchDetail, InternSummary, Role } from '@feedback-portal/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app.tsx';
import { problem, type Reply, signedInWith, stubApi, userWith } from '../test/stub-api.ts';

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
const otherPm = { id: '01890a5d-ac96-774b-bcce-b30209000099', name: 'Oli Other', avatarUrl: null };

const batch = (overrides: Partial<BatchDetail> = {}): BatchDetail => ({
  id: batchId,
  name: 'Batch 2027',
  startDate: '2027-01-11',
  endDate: '2028-06-25',
  isArchived: false,
  programManager: { id: me.id, name: me.name, avatarUrl: null },
  mentorCount: 0,
  mentors: [],
  members: [],
  ...overrides,
});

const added: InternSummary = {
  id: '01890a5d-ac96-774b-bcce-b30209000002',
  batchId,
  username: 'zoya.ansari',
  name: 'Zoya Ansari',
  email: 'zoya@example.com',
  status: 'active',
  colorCode: null,
  noticeEndsOn: null,
};

const addPath = `POST /batches/${batchId}/interns`;

const stub = (
  roles: [Role, ...Role[]] = ['program_manager'],
  detail: BatchDetail = batch(),
  reply: Reply = { status: 201, body: added },
) =>
  stubApi({
    ...signedInWith(roles),
    [`GET /batches/${batchId}`]: { status: 200, body: detail },
    [addPath]: reply,
  });

const loaded = async () => {
  const user = userEvent.setup();
  renderApp(`/batches/${batchId}`);
  await screen.findByRole('heading', { level: 1, name: 'Batch 2027' });
  return user;
};

const openDialog = async () => {
  const user = await loaded();
  await user.click(screen.getByRole('button', { name: 'Add intern' }));
  return { user, dialog: within(screen.getByRole('dialog', { name: 'Add intern' })) };
};

/** By accessible name, which leaves out the decorative "*" of required fields. */
const field = (dialog: ReturnType<typeof within>, name: string) =>
  dialog.getByRole('textbox', { name });

const posts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => (typeof init?.body === 'string' ? JSON.parse(init.body) : undefined));

const fillRequired = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: ReturnType<typeof within>,
) => {
  await user.type(field(dialog, 'Username'), '@Zoya.Ansari');
  await user.type(field(dialog, 'Full name'), 'Zoya Ansari');
  await user.type(field(dialog, 'Email'), 'Zoya@Example.com');
};

describe('who can add interns', () => {
  it("shows Add intern to the batch's PM, before Assign mentors", async () => {
    stub();
    await loaded();

    const buttons = screen
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((text) => text === 'Add intern' || text === 'Assign mentors');
    expect(buttons).toEqual(['Add intern', 'Assign mentors']);
  });

  it('shows it to an admin who is not the PM', async () => {
    stub(['admin'], batch({ programManager: otherPm }));
    await loaded();

    expect(screen.getByRole('button', { name: 'Add intern' })).toBeInTheDocument();
  });

  it('hides it from a mentor, and on an archived batch', async () => {
    stub(['mentor'], batch({ programManager: otherPm }));
    await loaded();
    expect(screen.queryByRole('button', { name: 'Add intern' })).not.toBeInTheDocument();
  });

  it('hides it on an archived batch, even from its PM', async () => {
    stub(['program_manager'], batch({ isArchived: true }));
    await loaded();
    expect(screen.queryByRole('button', { name: 'Add intern' })).not.toBeInTheDocument();
  });
});

describe('Add intern', () => {
  it("shows A14's fields, marks the required ones and starts on Username", async () => {
    stub();
    const { dialog } = await openDialog();

    expect(
      screen.getByText(
        "Use this when the intern isn't in Airtable. Later imports match interns by username.",
      ),
    ).toBeInTheDocument();
    const username = field(dialog, 'Username');
    expect(username).toHaveFocus();
    expect(username).toHaveAccessibleDescription('Lowercase, as in Airtable.');
    expect(field(dialog, 'Interview notes')).toHaveAccessibleDescription('Markdown supported.');
    expect(field(dialog, 'Phone')).toHaveAttribute('type', 'tel');
    expect(field(dialog, 'Interview notes')).toHaveAttribute('rows', '5');
    const required = ['Username', 'Full name', 'Email'];
    for (const label of [
      ...required,
      'Phone',
      'Diploma branch',
      "Parents' names",
      'Interview notes',
    ]) {
      expect(field(dialog, label).getAttribute('aria-required')).toBe(
        required.includes(label) ? 'true' : null,
      );
    }
  });

  it('checks the fields with the contract before sending anything', async () => {
    const fetchMock = stub();
    const { user, dialog } = await openDialog();
    await user.type(field(dialog, 'Username'), 'zoya ansari');
    await user.type(field(dialog, 'Email'), 'nope');

    await user.click(dialog.getByRole('button', { name: 'Add intern' }));

    expect(field(dialog, 'Username')).toHaveAccessibleDescription(
      'Username can only contain letters, digits, ".", "_" and "-"',
    );
    expect(field(dialog, 'Full name')).toHaveAccessibleDescription('Name is required');
    expect(field(dialog, 'Email')).toHaveAccessibleDescription('Invalid email address');
    expect(posts(fetchMock)).toEqual([]);
  });

  it('adds the intern, normalised, and confirms it in the dialog', async () => {
    const fetchMock = stub();
    const { user, dialog } = await openDialog();
    await fillRequired(user, dialog);
    await user.type(field(dialog, 'Diploma branch'), 'Information Technology');
    await user.type(field(dialog, 'Interview notes'), '### Technical round');

    await user.click(dialog.getByRole('button', { name: 'Add intern' }));

    const done = await dialog.findByRole('button', { name: 'Done' });
    expect(done).toHaveFocus();
    expect(done).toHaveAccessibleDescription(
      'Zoya Ansari added to Batch 2027 Zoya Ansari is on the roster as Active, with no colour code.',
    );
    expect(dialog.queryByRole('textbox')).not.toBeInTheDocument();
    expect(posts(fetchMock)).toEqual([
      {
        username: 'zoya.ansari',
        name: 'Zoya Ansari',
        email: 'zoya@example.com',
        phone: null,
        diplomaBranch: 'Information Technology',
        parentNames: null,
        interviewNotes: '### Technical round',
      },
    ]);
  });

  it('starts an empty form on Add another, and closes on Done', async () => {
    stub();
    const { user, dialog } = await openDialog();
    await fillRequired(user, dialog);
    await user.click(dialog.getByRole('button', { name: 'Add intern' }));
    await user.click(await dialog.findByRole('button', { name: 'Add another' }));

    expect(field(dialog, 'Username')).toHaveValue('');
    expect(field(dialog, 'Full name')).toHaveValue('');
    expect(field(dialog, 'Username')).toHaveFocus();

    await fillRequired(user, dialog);
    await user.click(dialog.getByRole('button', { name: 'Add intern' }));
    await user.click(await dialog.findByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add intern' })).toHaveFocus();
  });

  it('shows a taken username under Username and keeps what was typed', async () => {
    stub(undefined, undefined, problem(409, 'intern_username_taken'));
    const { user, dialog } = await openDialog();
    await fillRequired(user, dialog);

    await user.click(dialog.getByRole('button', { name: 'Add intern' }));

    const username = field(dialog, 'Username');
    await waitFor(() =>
      expect(username).toHaveAccessibleDescription('This username is already in the batch.'),
    );
    expect(username).toHaveFocus();
    expect(username).toHaveValue('@Zoya.Ansari');
    expect(dialog.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  });

  it('shows any other failure in the dialog', async () => {
    stub(undefined, undefined, problem(500, 'internal'));
    const { user, dialog } = await openDialog();
    await fillRequired(user, dialog);

    await user.click(dialog.getByRole('button', { name: 'Add intern' }));

    expect(await dialog.findByText("We couldn't add this intern")).toBeInTheDocument();
    expect(field(dialog, 'Username')).toHaveValue('@Zoya.Ansari');
  });

  it('sends nothing on Cancel', async () => {
    const fetchMock = stub();
    const { user, dialog } = await openDialog();
    await fillRequired(user, dialog);

    await user.click(dialog.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(posts(fetchMock)).toEqual([]);
  });
});
