import type {
  BatchDetail,
  FieldMapping,
  ImportColumns,
  ImportPreview,
  ImportResult,
  Role,
} from '@feedback-portal/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noInternCounts } from '../test/fixtures.ts';
import { renderApp } from '../test/render-app.tsx';
import { problem, type Reply, signedInWith, stubApi } from '../test/stub-api.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2027, 2, 1, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const batchId = '01890a5d-ac96-774b-bcce-b30209000001';
const meId = '01890a5d-ac96-774b-bcce-b302099a8057';
const otherPm = { id: '01890a5d-ac96-774b-bcce-b30209000099', name: 'Oli Other', avatarUrl: null };

const batch = (overrides: Partial<BatchDetail> = {}): BatchDetail => ({
  id: batchId,
  name: 'Batch 2027',
  startDate: '2027-01-11',
  endDate: '2028-06-25',
  isArchived: false,
  programManager: { id: meId, name: 'Ada Lovelace', avatarUrl: null },
  mentorCount: 0,
  interns: noInternCounts,
  mentors: [],
  members: [],
  ...overrides,
});

const preview: ImportPreview = {
  recordCount: 5,
  counts: { new: 2, updated: 1, invalid: 2 },
  new: [
    { row: 1, username: 'zoya.ansari', name: 'Zoya Ansari' },
    { row: 3, username: 'kabir.nair', name: 'Kabir Nair' },
  ],
  updated: [
    {
      row: 2,
      username: 'ishita.rao',
      name: 'Ishita Rao',
      internId: '01890a5d-ac96-774b-bcce-b30209000002',
    },
  ],
  invalid: [
    { row: 4, username: null, reasons: ['Username is missing.'] },
    {
      row: 5,
      username: 'neha.joshi',
      reasons: ['Email is not a valid address.', 'Username is used by row 1.'],
    },
  ],
};

const result: ImportResult = {
  importId: '01890a5d-ac96-774b-bcce-b30209000003',
  counts: { created: 2, updated: 1, skipped: 2 },
  invalid: preview.invalid,
};

/** The real view's columns (8.6): no username column, so the username comes from the email. */
const mapping: FieldMapping = {
  username: { kind: 'fromEmail' },
  name: 'Name',
  email: 'Email ID',
  phone: 'Mobile Number',
  diplomaBranch: 'Diploma Branch',
  parentNames: null,
  interviewNotes: null,
};

const columns: ImportColumns = {
  recordCount: 5,
  columns: ['Name', 'Email ID', 'Mobile Number', 'Whatsapp number', 'Diploma Branch', 'Batch'],
  mapping,
  missing: [],
};

const columnsPath = `POST /batches/${batchId}/imports/columns`;
const previewPath = `POST /batches/${batchId}/imports/preview`;
const importPath = `POST /batches/${batchId}/imports`;

const source = {
  token: 'pat-test-key',
  baseId: 'appAbCdEfGhIjKlMn',
  tableId: 'tblAbCdEfGhIjKlMn',
  view: 'Batch 2 – confirmed',
};

const request = { ...source, mapping };

const stub = ({
  roles = ['program_manager'],
  detail = batch(),
  columnsReply = { status: 200, body: columns },
  previewReply = { status: 200, body: preview },
  importReply = { status: 201, body: result },
}: Partial<{
  roles: [Role, ...Role[]];
  detail: BatchDetail;
  columnsReply: Reply;
  previewReply: Reply;
  importReply: Reply;
}> = {}) => {
  const replies: Record<string, Reply> = {
    ...signedInWith(roles),
    [`GET /batches/${batchId}`]: { status: 200, body: detail },
    [`GET /batches/${batchId}/interns`]: { status: 200, body: [] },
    [columnsPath]: columnsReply,
    [previewPath]: previewReply,
    [importPath]: importReply,
  };
  return { replies, fetchMock: stubApi(replies) };
};

const loaded = async () => {
  const user = userEvent.setup();
  renderApp(`/batches/${batchId}`);
  await screen.findByRole('heading', { level: 1, name: 'Batch 2027' });
  await screen.findByText('No interns yet');
  return user;
};

const dialogName = 'Import interns from Airtable';

const openDialog = async () => {
  const user = await loaded();
  // The header's button (the empty roster has a second one).
  const [button] = screen.getAllByRole('button', { name: 'Import from Airtable' });
  await user.click(button ?? document.body);
  return { user, dialog: within(screen.getByRole('dialog', { name: dialogName })) };
};

type Within = ReturnType<typeof within>;

/** The key is a password field, which has no textbox role. */
const keyField = (dialog: Within) => dialog.getByLabelText(/^API key/);
const field = (dialog: Within, name: string) => dialog.getByRole('textbox', { name });

const fillSource = async (user: ReturnType<typeof userEvent.setup>, dialog: Within) => {
  await user.type(keyField(dialog), source.token);
  await user.type(field(dialog, 'Base ID'), ` ${source.baseId} `);
  await user.type(field(dialog, 'Table ID'), source.tableId);
  await user.type(field(dialog, 'View name'), source.view);
};

const pathOf = (input: Parameters<typeof fetch>[0]) =>
  new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    location.href,
  ).pathname;

const posts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([input, init]) => ({
      path: pathOf(input),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }));

const select = (dialog: Within, name: string) => dialog.getByRole('combobox', { name });

/** Source filled in, then Next to the Fields step. */
const toFields = async (overrides: Parameters<typeof stub>[0] = {}) => {
  const stubbed = stub(overrides);
  const { user, dialog } = await openDialog();
  await fillSource(user, dialog);
  await user.click(dialog.getByRole('button', { name: 'Next' }));
  await dialog.findByRole('combobox', { name: 'Username' });
  return { ...stubbed, user, dialog };
};

const toPreview = async (overrides: Parameters<typeof stub>[0] = {}) => {
  const reached = await toFields(overrides);
  await reached.user.click(reached.dialog.getByRole('button', { name: 'Preview import' }));
  await reached.dialog.findByRole('button', { name: /^Import \d+ interns?$/ });
  return reached;
};

const currentStep = (dialog: Within) =>
  within(dialog.getByRole('list', { name: 'Import steps' }))
    .getAllByRole('listitem')
    .find((item) => item.getAttribute('aria-current') === 'step')?.textContent;

describe('who can import', () => {
  it('puts Import from Airtable between Add intern and Assign mentors (v2 A2)', async () => {
    stub();
    await loaded();

    const header = screen
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((text) => ['Add intern', 'Import from Airtable', 'Assign mentors'].includes(text));
    // Then the empty roster's two.
    expect(header).toEqual([
      'Add intern',
      'Import from Airtable',
      'Assign mentors',
      'Import from Airtable',
      'Add intern',
    ]);
  });

  it('shows it to an admin who is not the PM', async () => {
    stub({ roles: ['admin'], detail: batch({ programManager: otherPm }) });
    await loaded();
    expect(screen.getAllByRole('button', { name: 'Import from Airtable' })).toHaveLength(2);
  });

  it('hides it from a mentor and on an archived batch', async () => {
    stub({ roles: ['mentor'], detail: batch({ programManager: otherPm }) });
    await loaded();
    expect(screen.queryByRole('button', { name: 'Import from Airtable' })).not.toBeInTheDocument();
  });

  it('hides it on an archived batch, even from its PM', async () => {
    stub({ detail: batch({ isArchived: true }) });
    await loaded();
    expect(screen.queryByRole('button', { name: 'Import from Airtable' })).not.toBeInTheDocument();
  });
});

describe('Source', () => {
  it('shows the four fields, the key as a password nobody saves, and starts on it', async () => {
    stub();
    const { dialog } = await openDialog();

    expect(
      screen.getByText(
        'Into Batch 2027. Interns are matched by their Airtable record or username: new ones are added and existing ones updated.',
      ),
    ).toBeInTheDocument();
    expect(currentStep(dialog)).toBe('1Source');
    const key = keyField(dialog);
    expect(key).toHaveFocus();
    expect(key).toHaveAttribute('type', 'password');
    expect(key).toHaveAttribute('autocomplete', 'off');
    expect(key).toHaveAttribute('data-1p-ignore');
    expect(key).toHaveAccessibleDescription("Used for this import only. It isn't stored.");
    expect(field(dialog, 'Base ID')).toHaveAccessibleDescription('Starts with “app”.');
    expect(field(dialog, 'Table ID')).toHaveAccessibleDescription('Starts with “tbl”.');
    expect(field(dialog, 'View name')).toBeInTheDocument();
  });

  it('checks the source with the contract before sending anything', async () => {
    const { fetchMock } = stub();
    const { user, dialog } = await openDialog();
    await user.type(field(dialog, 'Table ID'), 'Interns 2026');

    await user.click(dialog.getByRole('button', { name: 'Next' }));

    expect(keyField(dialog)).toHaveAccessibleDescription('Enter an API key');
    expect(field(dialog, 'Base ID')).toHaveAccessibleDescription('Base IDs start with “app”');
    expect(field(dialog, 'Table ID')).toHaveAccessibleDescription('Table IDs start with “tbl”');
    expect(field(dialog, 'View name')).toHaveAccessibleDescription('Enter a view name');
    expect(posts(fetchMock)).toEqual([]);
  });

  it('reads the view with exactly what was typed, trimmed, then previews with the mapping', async () => {
    const { fetchMock } = await toPreview();

    expect(posts(fetchMock)).toEqual([
      { path: `/api/batches/${batchId}/imports/columns`, body: source },
      { path: `/api/batches/${batchId}/imports/preview`, body: request },
    ]);
  });

  it("shows Airtable's refusal and keeps what was typed", async () => {
    stub({
      columnsReply: problem(
        422,
        'airtable_source_invalid',
        "Airtable said: INVALID_PERMISSIONS. This key can't read the base.",
      ),
    });
    const { user, dialog } = await openDialog();
    await fillSource(user, dialog);

    await user.click(dialog.getByRole('button', { name: 'Next' }));

    const alert = await dialog.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't connect to Airtable");
    expect(alert).toHaveTextContent(
      "Airtable said: INVALID_PERMISSIONS. This key can't read the base.",
    );
    expect(keyField(dialog)).toHaveValue(source.token);
    expect(field(dialog, 'View name')).toHaveValue(source.view);
  });

  it('says something general for any other failure', async () => {
    stub({ columnsReply: problem(400, 'validation_failed') });
    const { user, dialog } = await openDialog();
    await fillSource(user, dialog);

    await user.click(dialog.getByRole('button', { name: 'Next' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      "We couldn't read the viewSomething went wrong. Try again in a moment.",
    );
  });

  it('forgets the key once the dialog closes', async () => {
    const { fetchMock } = stub();
    const { user, dialog } = await openDialog();
    await fillSource(user, dialog);
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const [button] = screen.getAllByRole('button', { name: 'Import from Airtable' });
    await user.click(button ?? document.body);

    const reopened = within(screen.getByRole('dialog', { name: dialogName }));
    expect(keyField(reopened)).toHaveValue('');
    expect(field(reopened, 'Base ID')).toHaveValue('');
    expect(posts(fetchMock)).toEqual([]);
  });
});

describe('Preview', () => {
  it('shows the counts, the invalid rows with every reason, and Import N', async () => {
    const { dialog } = await toPreview();

    expect(currentStep(dialog)).toBe('3Preview');
    const counts = dialog.getAllByRole('definition').map((cell) => cell.textContent);
    expect(counts).toEqual(['2', '1', '2']);
    const rows = within(dialog.getByRole('table'))
      .getAllByRole('row')
      .map((row) => row.textContent);
    expect(rows).toEqual([
      'RowUsernameReason',
      '4—Username is missing.',
      '5neha.joshiEmail is not a valid address.Username is used by row 1.',
    ]);
    expect(
      dialog.getByText(
        'Fix invalid rows in Airtable and import again, or add those interns by hand.',
      ),
    ).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Import 3 interns' })).toHaveFocus();
  });

  it('goes Back to the fields with the choices kept, then to the source with the values kept', async () => {
    const { user, dialog } = await toFields();
    await user.selectOptions(select(dialog, 'Phone'), 'Whatsapp number');
    await user.click(dialog.getByRole('button', { name: 'Preview import' }));
    await dialog.findByRole('button', { name: 'Import 3 interns' });

    await user.click(dialog.getByRole('button', { name: 'Back' }));

    expect(currentStep(dialog)).toBe('2Fields');
    expect(select(dialog, 'Phone')).toHaveDisplayValue('Whatsapp number');
    await user.click(dialog.getByRole('button', { name: 'Back' }));
    expect(keyField(dialog)).toHaveValue(source.token);
    expect(field(dialog, 'Base ID')).toHaveValue(source.baseId);
    expect(field(dialog, 'View name')).toHaveValue(source.view);
  });

  it('disables Import when no row can be imported', async () => {
    const { dialog } = await toPreview({
      previewReply: {
        status: 200,
        body: { ...preview, counts: { new: 0, updated: 0, invalid: 2 }, new: [], updated: [] },
      },
    });

    expect(dialog.getByRole('button', { name: 'Import 0 interns' })).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Back' })).toHaveFocus();
  });

  it('leaves out the invalid rows when there are none', async () => {
    const { dialog } = await toPreview({
      previewReply: {
        status: 200,
        body: { ...preview, counts: { new: 1, updated: 0, invalid: 0 }, updated: [], invalid: [] },
      },
    });

    expect(dialog.getByRole('button', { name: 'Import 1 intern' })).toBeEnabled();
    expect(dialog.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('Import', () => {
  it('sends the same source and mapping again, then shows the result', async () => {
    const { user, dialog, fetchMock } = await toPreview();

    await user.click(dialog.getByRole('button', { name: 'Import 3 interns' }));

    const done = await dialog.findByRole('button', { name: 'Done' });
    expect(currentStep(dialog)).toBe('4Result');
    expect(done).toHaveFocus();
    expect(done).toHaveAccessibleDescription(
      "Import completed 2 added, 1 updated, 2 skipped. Skipped rows weren't changed.",
    );
    const rows = dialog.getAllByRole('term').map((term) => term.textContent);
    expect(rows).toEqual(['Added', 'Updated', 'Skipped (invalid)']);
    expect(dialog.getAllByRole('definition').map((cell) => cell.textContent)).toEqual([
      '2',
      '1',
      '2',
    ]);
    expect(posts(fetchMock).at(-1)).toEqual({
      path: `/api/batches/${batchId}/imports`,
      body: request,
    });
  });

  it('shows the importing state while the import runs', async () => {
    const { user, dialog, fetchMock } = await toPreview();
    const answer = fetchMock.getMockImplementation();
    let release: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((input, init) =>
      init?.method === 'POST'
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : (answer?.(input, init) ?? Promise.reject(new Error('no stub'))),
    );

    await user.click(dialog.getByRole('button', { name: 'Import 3 interns' }));

    expect(await dialog.findByRole('status')).toHaveTextContent('Importing 3 interns');
    // The footer's Close, beside the dialog's own.
    expect(dialog.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
    release?.(
      new Response(JSON.stringify(result), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(await dialog.findByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('refreshes the roster and the batch afterwards', async () => {
    const { user, dialog, fetchMock } = await toPreview();
    const gets = (path: string) =>
      fetchMock.mock.calls.filter(
        ([input, init]) => (init?.method ?? 'GET') === 'GET' && pathOf(input) === `/api${path}`,
      ).length;
    const before = {
      roster: gets(`/batches/${batchId}/interns`),
      batch: gets(`/batches/${batchId}`),
    };

    await user.click(dialog.getByRole('button', { name: 'Import 3 interns' }));
    await dialog.findByRole('button', { name: 'Done' });

    await waitFor(() => expect(gets(`/batches/${batchId}/interns`)).toBe(before.roster + 1));
    expect(gets(`/batches/${batchId}`)).toBe(before.batch + 1);
  });

  it('shows a failure, goes Back to the preview, and tries again with the same request', async () => {
    const { user, dialog, fetchMock, replies } = await toPreview();
    replies[importPath] = problem(
      502,
      'airtable_unavailable',
      'Airtable said: RATE_LIMIT_REACHED. Airtable is busy; try again in 30 seconds.',
    );

    await user.click(dialog.getByRole('button', { name: 'Import 3 interns' }));

    const alert = await dialog.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Import failedAirtable said: RATE_LIMIT_REACHED. Airtable is busy; try again in 30 seconds. Nothing was saved.',
    );
    expect(currentStep(dialog)).toBe('4Result');
    expect(dialog.getByRole('button', { name: 'Try again' })).toHaveFocus();

    await user.click(dialog.getByRole('button', { name: 'Back' }));
    expect(dialog.getByRole('button', { name: 'Import 3 interns' })).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Import 3 interns' }));
    await dialog.findByRole('alert');

    replies[importPath] = { status: 201, body: result };
    await user.click(dialog.getByRole('button', { name: 'Try again' }));

    expect(await dialog.findByRole('button', { name: 'Done' })).toBeInTheDocument();
    const imports = posts(fetchMock).filter(({ path }) => path.endsWith('/imports'));
    expect(imports).toHaveLength(3);
    expect(imports.every(({ body }) => JSON.stringify(body) === JSON.stringify(request))).toBe(
      true,
    );
  });

  it("says the import couldn't be saved for a failure without Airtable's sentence", async () => {
    const { user, dialog, replies } = await toPreview();
    replies[importPath] = problem(500, 'internal');

    await user.click(dialog.getByRole('button', { name: 'Import 3 interns' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      "Import failedThe import couldn't be saved. Nothing was saved.",
    );
  });
});

describe('Fields', () => {
  it("lists every intern field with the view's columns, pre-filled, starting on the first", async () => {
    const { dialog } = await toFields();

    expect(currentStep(dialog)).toBe('2Fields');
    expect(
      dialog.getByText(
        "Match the view's columns to intern fields. They're saved for Batch 2027 when you import.",
      ),
    ).toBeInTheDocument();
    const shown: Readonly<Record<string, string>> = {
      Username: 'From the email (before @)',
      Name: 'Name',
      Email: 'Email ID',
      Phone: 'Mobile Number',
      'Diploma branch': 'Diploma Branch',
      "Parents' names": 'Not imported',
      'Interview notes': 'Not imported',
    };
    for (const [name, value] of Object.entries(shown)) {
      expect(select(dialog, name)).toHaveDisplayValue(value);
    }
    expect(select(dialog, 'Username')).toHaveFocus();
    expect(select(dialog, 'Username')).toBeRequired();
    expect(
      within(select(dialog, 'Phone'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Not imported', ...columns.columns]);
  });

  it('sends the chosen columns, a username column, and fields left out', async () => {
    const { user, dialog, fetchMock } = await toFields();

    await user.selectOptions(select(dialog, 'Username'), 'Batch');
    await user.selectOptions(select(dialog, 'Phone'), 'Whatsapp number');
    await user.selectOptions(select(dialog, 'Diploma branch'), 'Not imported');
    await user.click(dialog.getByRole('button', { name: 'Preview import' }));
    await dialog.findByRole('button', { name: 'Import 3 interns' });

    expect(posts(fetchMock).at(-1)?.body.mapping).toEqual({
      ...mapping,
      username: { kind: 'column', column: 'Batch' },
      phone: 'Whatsapp number',
      diplomaBranch: null,
    });
  });

  it('asks for the required fields that have no column, sending nothing', async () => {
    const { user, dialog, fetchMock } = await toFields({
      columnsReply: {
        status: 200,
        body: {
          ...columns,
          mapping: { ...mapping, username: null, email: null },
          missing: [
            { field: 'username', column: 'Username' },
            { field: 'email', column: 'Email' },
          ],
        },
      },
    });
    expect(select(dialog, 'Email')).toHaveAccessibleDescription("“Email” isn't in this view.");

    await user.click(dialog.getByRole('button', { name: 'Preview import' }));

    expect(select(dialog, 'Username')).toHaveAccessibleDescription('Choose a column.');
    expect(select(dialog, 'Email')).toHaveAccessibleDescription('Choose a column.');
    expect(select(dialog, 'Username')).toHaveFocus();
    expect(posts(fetchMock).map(({ path }) => path)).toEqual([
      `/api/batches/${batchId}/imports/columns`,
    ]);
    await user.selectOptions(select(dialog, 'Email'), 'Email ID');
    expect(select(dialog, 'Email')).not.toHaveAccessibleDescription();
  });

  it("shows the API's refusal of a mapping", async () => {
    const { user, dialog } = await toFields({
      previewReply: problem(
        422,
        'airtable_mapping_invalid',
        'This view has no “Mobile Number” column. Choose the fields again.',
      ),
    });

    await user.click(dialog.getByRole('button', { name: 'Preview import' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      "We couldn't preview the importThis view has no “Mobile Number” column. Choose the fields again.",
    );
  });

  it('says so when the view has no records', async () => {
    const { user, dialog } = await (async () => {
      stub({
        columnsReply: { status: 200, body: { ...columns, recordCount: 0, columns: [] } },
      });
      const opened = await openDialog();
      await fillSource(opened.user, opened.dialog);
      await opened.user.click(opened.dialog.getByRole('button', { name: 'Next' }));
      return opened;
    })();

    expect(await dialog.findByText('This view has no records')).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Preview import' })).not.toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Back' }));
    expect(keyField(dialog)).toHaveValue(source.token);
  });
});
