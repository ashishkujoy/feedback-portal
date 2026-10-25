import {
  BatchDetail,
  type FieldMapping,
  ImportColumns,
  ImportPreview,
  ImportResult,
  InternDetail,
  InternSummary,
  ProblemDetails,
  type Role,
} from '@feedback-portal/contracts';
import { type LogRecord, reset } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { realApp } from '../../../../test/app-deps.ts';
import { useTestDb } from '../../../../test/test-db.ts';
import { configureLogging } from '../../../shared/logging/logging.ts';
import {
  AirtableError,
  type AirtableErrorReason,
  type AirtableRecord,
  type AirtableSource,
} from '../application/airtable-source.ts';
import { InternId } from '../domain/intern-id.ts';
import { createInternRepository } from '../infrastructure/drizzle-intern-repository.ts';
import { airtableFieldMappings, airtableImports, interns } from '../infrastructure/schema.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;

afterEach(async () => {
  await reset();
});

const recorded = (pages = ['page-1', 'page-2']): readonly AirtableRecord[] =>
  pages.flatMap((name) => {
    const page: { records: AirtableRecord[] } = JSON.parse(
      readFileSync(
        new URL(`../../../../test/fixtures/airtable/${name}.json`, import.meta.url),
        'utf8',
      ),
    );
    return page.records;
  });

const token = 'patVerySecret.0123456789abcdef';
const source = {
  token,
  baseId: 'appAbCdEfGh123456',
  tableId: 'tblX9mQ2rLk4vP8zz',
  view: 'Batch 2 – confirmed',
};

/** The recorded pages' columns, as 8.2 named them. */
const mapping: FieldMapping = {
  username: { kind: 'column', column: 'Username' },
  name: 'Full name',
  email: 'Email',
  phone: 'Phone',
  diplomaBranch: 'Diploma branch',
  parentNames: "Parents' names",
  interviewNotes: 'Interview notes',
};

/** The real view's columns (8.6), with the username from the email. */
const realMapping: FieldMapping = {
  username: { kind: 'fromEmail' },
  name: 'Name',
  email: 'Email ID',
  phone: 'Mobile Number',
  diplomaBranch: 'Diploma Branch',
  parentNames: null,
  interviewNotes: null,
};

const request = { ...source, mapping };

type Setup = ReturnType<typeof realApp>;

const post = ({ app, webAppUrl }: Setup, cookie: string, path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie, origin: webAppUrl, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const problemOf = async (response: Response, status: number) => {
  expect(response.status).toBe(status);
  return ProblemDetails.parse(await response.json());
};

/** The app with a fake Airtable, a batch run by Pat with one mentor, and Ishita already in it. */
const setUp = async (airtable: AirtableSource) => {
  const setup = realApp(db(), { airtable });
  const person = (name: string, roles: [Role, ...Role[]]) => setup.signedInUser({ name, roles });
  const admin = await person('Ada Admin', ['admin']);
  const pm = await person('Pat Manager', ['program_manager']);
  const mentor = await person('Mo Mentor', ['mentor']);
  const batch = BatchDetail.parse(
    await (
      await post(setup, admin.cookie, '/batches', {
        name: 'Batch 1',
        startDate: '2027-01-11',
        endDate: '2028-06-25',
        programManagerId: pm.user.id,
      })
    ).json(),
  );
  await post(setup, admin.cookie, `/batches/${batch.id}/mentors`, { userId: mentor.user.id });
  const added = await post(setup, pm.cookie, `/batches/${batch.id}/interns`, {
    username: 'ishita.rao',
    name: 'Ishita Rao',
    email: 'ishita@example.com',
  });
  const { id } = InternSummary.parse(await added.json());
  const preview = (who: { cookie: string }, body: unknown = request) =>
    post(setup, who.cookie, `/batches/${batch.id}/imports/preview`, body);
  return { setup, person, admin, pm, mentor, batch, ishitaId: InternId.parse(id), preview };
};

const recordedSource = () => ({
  fetchRecords: vi.fn<AirtableSource['fetchRecords']>(() => Promise.resolve(recorded())),
});

describe('POST /batches/:batchId/imports/preview', () => {
  it('says what an import would do, writing nothing', async () => {
    const airtable = recordedSource();
    const { pm, ishitaId, preview } = await setUp(airtable);
    const before = await createInternRepository(db()).findById(ishitaId);

    const response = await preview(pm);

    expect(response.status).toBe(200);
    const body = ImportPreview.parse(await response.json());
    expect(body.counts).toEqual({ new: 2, updated: 1, invalid: 0 });
    expect(body.updated).toEqual([
      { row: 1, username: 'ishita.rao', name: 'Ishita Rao', internId: ishitaId },
    ]);
    expect(body.new.map((row) => row.username)).toEqual(['zoya.ansari', 'kabir.nair']);
    expect(airtable.fetchRecords).toHaveBeenCalledWith(source);
    expect(await createInternRepository(db()).findById(ishitaId)).toEqual(before);
  });

  it('refuses a row matching a graduated intern', async () => {
    const { setup, pm, batch, ishitaId, preview } = await setUp(recordedSource());
    await post(setup, pm.cookie, `/batches/${batch.id}/interns/${ishitaId}/status-changes`, {
      action: 'graduate',
      reason: 'Done',
    });

    const body = ImportPreview.parse(await (await preview(pm)).json());

    expect(body.invalid).toEqual([
      {
        row: 1,
        username: 'ishita.rao',
        reasons: ['ishita.rao has graduated, so their record is read-only.'],
      },
    ]);
    expect(body.counts).toEqual({ new: 2, updated: 0, invalid: 1 });
  });

  it("is for the batch's managers, while it isn't archived", async () => {
    const airtable = recordedSource();
    const { setup, admin, pm, mentor, person, batch, preview } = await setUp(airtable);
    const otherPm = await person('Oli Other', ['program_manager']);

    const statuses = await Promise.all(
      [admin, pm, mentor, otherPm, { cookie: '' }].map(async (who) => (await preview(who)).status),
    );
    expect(statuses).toEqual([200, 200, 403, 404, 401]);

    await post(setup, admin.cookie, `/batches/${batch.id}/archive`, {});
    expect((await problemOf(await preview(pm), 409)).code).toBe('batch_archived');
    // Refused before Airtable is asked.
    expect(airtable.fetchRecords).toHaveBeenCalledTimes(2);
  });

  it('checks the source before asking Airtable', async () => {
    const airtable = recordedSource();
    const { pm, preview } = await setUp(airtable);

    const problem = await problemOf(
      await preview(pm, { token: '', baseId: 'base', tableId: 'Interns', view: '', mapping }),
      400,
    );

    expect(problem.errors?.map((issue) => issue.path)).toEqual([
      'token',
      'baseId',
      'tableId',
      'view',
    ]);
    expect(airtable.fetchRecords).not.toHaveBeenCalled();
  });

  it.each<[AirtableErrorReason, string | null, number, string, string]>([
    [
      'unauthorized',
      'AUTHENTICATION_REQUIRED',
      422,
      'airtable_source_invalid',
      "Airtable said: AUTHENTICATION_REQUIRED. This key isn't valid.",
    ],
    [
      'forbidden',
      'INVALID_PERMISSIONS',
      422,
      'airtable_source_invalid',
      "Airtable said: INVALID_PERMISSIONS. This key can't read the base.",
    ],
    [
      'not_found',
      'NOT_FOUND',
      422,
      'airtable_source_invalid',
      "Airtable said: NOT_FOUND. The base or table wasn't found.",
    ],
    [
      'view_not_found',
      'VIEW_NAME_NOT_FOUND',
      422,
      'airtable_source_invalid',
      "Airtable said: VIEW_NAME_NOT_FOUND. The view wasn't found in the table.",
    ],
    [
      'too_many_records',
      null,
      422,
      'airtable_source_invalid',
      'The view has more records than one import can take (2,000).',
    ],
    [
      'rate_limited',
      'RATE_LIMIT_REACHED',
      502,
      'airtable_unavailable',
      'Airtable said: RATE_LIMIT_REACHED. Airtable is busy; try again in 30 seconds.',
    ],
    ['timeout', null, 502, 'airtable_unavailable', "Airtable didn't answer in time; try again."],
    [
      'unexpected',
      null,
      502,
      'airtable_unavailable',
      'Airtable gave an unexpected answer; try again.',
    ],
  ])('turns %s into a %i problem', async (reason, type, status, code, detail) => {
    const failing = {
      fetchRecords: () => Promise.reject(new AirtableError(reason, 'from the adapter', { type })),
    };
    const { pm, preview } = await setUp(failing);

    const problem = await problemOf(await preview(pm), status);

    expect(problem).toMatchObject({ code, detail });
  });

  it('never logs the token', async () => {
    const records: LogRecord[] = [];
    await configureLogging({ level: 'trace', format: 'json' }, (record) => records.push(record));
    const { pm, preview } = await setUp(recordedSource());

    const response = await preview(pm);

    expect(response.status).toBe(200);
    expect(records.map((record) => record.properties)).toContainEqual(
      expect.objectContaining({ new: 2, updated: 1, invalid: 0 }),
    );
    expect(
      JSON.stringify(records.map((record) => [record.message, record.properties])),
    ).not.toContain(token);
  });
});

const runsOf = async (batchId: string) =>
  db().select().from(airtableImports).where(eq(airtableImports.batchId, batchId));

const internsOf = async (batchId: string) =>
  db()
    .select({ username: interns.username, name: interns.name, status: interns.status })
    .from(interns)
    .where(eq(interns.batchId, batchId))
    .orderBy(interns.username);

describe('POST /batches/:batchId/imports', () => {
  it('adds the new interns and refreshes the matched one, recording the run', async () => {
    const { setup, pm, batch, ishitaId } = await setUp(recordedSource());

    const response = await post(setup, pm.cookie, `/batches/${batch.id}/imports`, request);

    expect(response.status).toBe(201);
    const result = ImportResult.parse(await response.json());
    expect(result.counts).toEqual({ created: 2, updated: 1, skipped: 0 });
    expect(response.headers.get('location')).toBe(
      `/batches/${batch.id}/imports/${result.importId}`,
    );
    const ishita = await createInternRepository(db()).findById(ishitaId);
    expect(ishita).toMatchObject({
      username: 'ishita.rao',
      email: 'ishita.rao@example.com',
      phone: '+91 98450 12345',
      status: 'active',
      airtableRecordId: 'recA1b2C3d4E5f6G7',
      airtableFields: expect.objectContaining({ 'Interview score': 8 }),
    });
    expect(ishita?.statusEvents).toHaveLength(1);
    expect((await internsOf(batch.id)).map((intern) => intern.username)).toEqual([
      'ishita.rao',
      'kabir.nair',
      'zoya.ansari',
    ]);
    const [run] = await runsOf(batch.id);
    expect(run).toMatchObject({
      status: 'completed',
      recordCount: 3,
      createdCount: 2,
      updatedCount: 1,
      skippedCount: 0,
      importedBy: pm.user.id,
      baseId: source.baseId,
      view: source.view,
    });
    // The new interns' history starts with an import by the PM.
    const zoya = await db()
      .select({ id: interns.id })
      .from(interns)
      .where(eq(interns.username, 'zoya.ansari'));
    const zoyaDetail = InternDetail.parse(
      await (
        await setup.app.request(`/batches/${batch.id}/interns/${zoya[0]?.id ?? ''}`, {
          headers: { cookie: pm.cookie },
        })
      ).json(),
    );
    expect(zoyaDetail).toMatchObject({ source: 'airtable', addedBy: { id: pm.user.id } });
  });

  it('is repeatable: the same import again adds no one', async () => {
    const { setup, pm, batch } = await setUp(recordedSource());
    await post(setup, pm.cookie, `/batches/${batch.id}/imports`, request);

    const again = ImportResult.parse(
      await (await post(setup, pm.cookie, `/batches/${batch.id}/imports`, request)).json(),
    );

    expect(again.counts).toEqual({ created: 0, updated: 3, skipped: 0 });
    expect(await internsOf(batch.id)).toHaveLength(3);
    expect((await runsOf(batch.id)).map((run) => run.status)).toEqual(['completed', 'completed']);
  });

  it('skips invalid rows, keeping their reasons but no field values', async () => {
    const records = [
      ...recorded(),
      {
        id: 'recD4e5F6g7H8i9J0',
        createdTime: '2026-06-04T09:00:00.000Z',
        fields: { 'Full name': 'Secret Person', Email: 'nope' },
      },
    ];
    const { setup, pm, batch } = await setUp({ fetchRecords: () => Promise.resolve(records) });

    const result = ImportResult.parse(
      await (await post(setup, pm.cookie, `/batches/${batch.id}/imports`, request)).json(),
    );

    expect(result.counts).toEqual({ created: 2, updated: 1, skipped: 1 });
    expect(result.invalid).toEqual([
      { row: 4, username: null, reasons: ['Username is required.', 'Invalid email address.'] },
    ]);
    const [run] = await runsOf(batch.id);
    expect(run?.errors).toEqual(result.invalid);
    expect(JSON.stringify(run)).not.toContain('Secret Person');
  });

  it('writes nothing when Airtable fails, and records why', async () => {
    const failing = {
      fetchRecords: () =>
        Promise.reject(new AirtableError('rate_limited', 'busy', { type: 'RATE_LIMIT_REACHED' })),
    };
    const { setup, pm, batch } = await setUp(failing);

    const problem = await problemOf(
      await post(setup, pm.cookie, `/batches/${batch.id}/imports`, request),
      502,
    );

    expect(problem.code).toBe('airtable_unavailable');
    expect(await internsOf(batch.id)).toHaveLength(1);
    const [run] = await runsOf(batch.id);
    expect(run).toMatchObject({
      status: 'failed',
      failureReason:
        'Airtable said: RATE_LIMIT_REACHED. Airtable is busy; try again in 30 seconds.',
      completedAt: expect.any(Date),
    });
  });

  it('is all or nothing when saving fails part-way', async () => {
    // Postgres can't store a NUL character in jsonb, so the third row's snapshot fails to save
    // after the first two were written.
    const [first, second, third] = recorded();
    if (!first || !second || !third) throw new Error('expected three recorded rows');
    const poisoned = { ...third, fields: { ...third.fields, Notes: 'bad\u0000cell' } };
    const { setup, pm, batch, ishitaId } = await setUp({
      fetchRecords: () => Promise.resolve([first, second, poisoned]),
    });
    const before = await createInternRepository(db()).findById(ishitaId);

    const response = await post(setup, pm.cookie, `/batches/${batch.id}/imports`, request);

    expect(response.status).toBe(500);
    expect((await internsOf(batch.id)).map((intern) => intern.username)).toEqual(['ishita.rao']);
    expect(await createInternRepository(db()).findById(ishitaId)).toEqual(before);
    const [run] = await runsOf(batch.id);
    expect(run).toMatchObject({ status: 'failed', failureReason: "The import couldn't be saved." });
  });

  it('runs two imports of the same batch one after the other, with no duplicates', async () => {
    const { setup, pm, admin, batch } = await setUp(recordedSource());

    const responses = await Promise.all(
      [pm, admin].map(async (who) =>
        post(setup, who.cookie, `/batches/${batch.id}/imports`, request),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const counts = await Promise.all(
      responses.map(async (response) => ImportResult.parse(await response.json()).counts),
    );
    expect(counts.map((count) => count.created).toSorted((a, b) => a - b)).toEqual([0, 2]);
    expect(await internsOf(batch.id)).toHaveLength(3);
  });

  it("is for the batch's managers, while it isn't archived, and checks the source first", async () => {
    const airtable = recordedSource();
    const { setup, admin, pm, mentor, person, batch } = await setUp(airtable);
    const otherPm = await person('Oli Other', ['program_manager']);
    const commit = (who: { cookie: string }, body: unknown = request) =>
      post(setup, who.cookie, `/batches/${batch.id}/imports`, body);

    const statuses = await Promise.all(
      [mentor, otherPm, { cookie: '' }].map(async (who) => (await commit(who)).status),
    );
    expect(statuses).toEqual([403, 404, 401]);
    expect((await commit(pm, { ...request, baseId: 'nope' })).status).toBe(400);
    expect((await commit(pm, source)).status).toBe(400);
    await post(setup, admin.cookie, `/batches/${batch.id}/archive`, {});
    expect((await problemOf(await commit(pm), 409)).code).toBe('batch_archived');
    expect(airtable.fetchRecords).not.toHaveBeenCalled();
    expect(await runsOf(batch.id)).toEqual([]);
  });

  it('keeps the token out of the logs, the run and the answer', async () => {
    const records: LogRecord[] = [];
    await configureLogging({ level: 'trace', format: 'json' }, (record) => records.push(record));
    const { setup, pm, batch } = await setUp(recordedSource());

    const response = await post(setup, pm.cookie, `/batches/${batch.id}/imports`, request);
    const body = await response.text();

    expect(body).not.toContain(token);
    expect(JSON.stringify(await runsOf(batch.id))).not.toContain(token);
    expect(
      JSON.stringify(records.map((record) => [record.message, record.properties])),
    ).not.toContain(token);
  });
});

const mappingOf = async (batchId: string) =>
  db()
    .select({ mapping: airtableFieldMappings.mapping, updatedBy: airtableFieldMappings.updatedBy })
    .from(airtableFieldMappings)
    .where(eq(airtableFieldMappings.batchId, batchId));

const columnsOf = async (setup: Setup, who: { cookie: string }, batchId: string) =>
  post(setup, who.cookie, `/batches/${batchId}/imports/columns`, source);

describe('POST /batches/:batchId/imports/columns', () => {
  it("lists the view's columns and starts from the defaults", async () => {
    const realView = { fetchRecords: () => Promise.resolve(recorded(['real-columns'])) };
    const { setup, pm, batch } = await setUp(realView);

    const response = await columnsOf(setup, pm, batch.id);

    expect(response.status).toBe(200);
    const body = ImportColumns.parse(await response.json());
    expect(body.recordCount).toBe(3);
    expect(body.columns.slice(0, 4)).toEqual([
      'Name',
      'Email ID',
      'Mobile Number',
      'Whatsapp number',
    ]);
    expect(body.columns).toContain('Photograph');
    expect(body.mapping).toEqual(realMapping);
    expect(body.missing).toEqual([]);
  });

  it("starts from the batch's saved mapping, else the latest any batch saved", async () => {
    const realView = { fetchRecords: () => Promise.resolve(recorded(['real-columns'])) };
    const { setup, admin, pm, batch } = await setUp(realView);
    const chosen = { ...realMapping, phone: 'Whatsapp number', diplomaBranch: null };
    await post(setup, pm.cookie, `/batches/${batch.id}/imports`, { ...source, mapping: chosen });
    const other = BatchDetail.parse(
      await (
        await post(setup, admin.cookie, '/batches', {
          name: 'Batch 2',
          startDate: '2027-07-05',
          endDate: '2028-12-20',
          programManagerId: pm.user.id,
        })
      ).json(),
    );

    const bodies = await Promise.all(
      [batch.id, other.id].map(async (batchId) =>
        ImportColumns.parse(await (await columnsOf(setup, pm, batchId)).json()),
      ),
    );
    expect(bodies.map((body) => body.mapping)).toEqual([chosen, chosen]);
  });

  it('names saved columns the view no longer has', async () => {
    const records = vi.fn<AirtableSource['fetchRecords']>(() => Promise.resolve(recorded()));
    const { setup, pm, batch } = await setUp({ fetchRecords: records });
    await post(setup, pm.cookie, `/batches/${batch.id}/imports`, request);
    records.mockResolvedValue(recorded(['real-columns']));

    const body = ImportColumns.parse(await (await columnsOf(setup, pm, batch.id)).json());

    // "Diploma branch" is still there as "Diploma Branch".
    expect(body.mapping).toMatchObject({
      username: null,
      name: null,
      email: null,
      phone: null,
      diplomaBranch: 'Diploma Branch',
    });
    expect(body.missing.map(({ field, column }) => `${field}:${column}`)).toEqual([
      'username:Username',
      'name:Full name',
      'email:Email',
      'phone:Phone',
      "parentNames:Parents' names",
      'interviewNotes:Interview notes',
    ]);
  });

  it("is for the batch's managers", async () => {
    const airtable = recordedSource();
    const { setup, admin, pm, mentor, person, batch } = await setUp(airtable);
    const otherPm = await person('Oli Other', ['program_manager']);

    const statuses = await Promise.all(
      [admin, pm, mentor, otherPm, { cookie: '' }].map(
        async (who) => (await columnsOf(setup, who, batch.id)).status,
      ),
    );

    expect(statuses).toEqual([200, 200, 403, 404, 401]);
    expect(airtable.fetchRecords).toHaveBeenCalledTimes(2);
  });
});

describe('importing through a mapping', () => {
  it('imports the real view, taking usernames from the emails', async () => {
    const realView = { fetchRecords: () => Promise.resolve(recorded(['real-columns'])) };
    const { setup, pm, batch, preview } = await setUp(realView);

    const previewed = ImportPreview.parse(
      await (await preview(pm, { ...source, mapping: realMapping })).json(),
    );
    expect(previewed.counts).toEqual({ new: 3, updated: 0, invalid: 0 });
    expect(previewed.new.map((row) => row.username)).toEqual([
      'arjun.mehta07',
      'leelaiyer22',
      'rohan.das',
    ]);
    // A preview saves nothing.
    expect(await mappingOf(batch.id)).toEqual([]);

    const result = await post(setup, pm.cookie, `/batches/${batch.id}/imports`, {
      ...source,
      mapping: realMapping,
    });

    expect(ImportResult.parse(await result.json()).counts).toEqual({
      created: 3,
      updated: 0,
      skipped: 0,
    });
    expect(await mappingOf(batch.id)).toEqual([{ mapping: realMapping, updatedBy: pm.user.id }]);
    const leela = await db()
      .select({ phone: interns.phone, diplomaBranch: interns.diplomaBranch, email: interns.email })
      .from(interns)
      .where(eq(interns.username, 'leelaiyer22'));
    // No mobile number, and Whatsapp isn't mapped.
    expect(leela).toEqual([
      { phone: null, diplomaBranch: 'Mechanical Engineering', email: 'leelaiyer22@example.com' },
    ]);
  });

  it('refuses a mapping that names a column the view lacks, writing nothing', async () => {
    const { setup, pm, batch, preview } = await setUp(recordedSource());
    const wrong = { ...source, mapping: { ...mapping, phone: 'Mobile Number' } };

    const previewed = await problemOf(await preview(pm, wrong), 422);
    const run = await problemOf(
      await post(setup, pm.cookie, `/batches/${batch.id}/imports`, wrong),
      422,
    );

    for (const problem of [previewed, run]) {
      expect(problem).toMatchObject({
        code: 'airtable_mapping_invalid',
        detail: 'This view has no “Mobile Number” column. Choose the fields again.',
      });
    }
    expect(await internsOf(batch.id)).toHaveLength(1);
    expect(await mappingOf(batch.id)).toEqual([]);
  });

  it('updates the intern from the same record after the email changed, keeping the username', async () => {
    const records = vi.fn<AirtableSource['fetchRecords']>(() =>
      Promise.resolve(recorded(['real-columns'])),
    );
    const { setup, pm, batch } = await setUp({ fetchRecords: records });
    const body = { ...source, mapping: realMapping };
    await post(setup, pm.cookie, `/batches/${batch.id}/imports`, body);
    const [arjun, ...others] = recorded(['real-columns']);
    if (!arjun) throw new Error('expected a recorded row');
    records.mockResolvedValue([
      { ...arjun, fields: { ...arjun.fields, 'Email ID': 'arjun.m@example.com' } },
      ...others,
    ]);

    const again = ImportResult.parse(
      await (await post(setup, pm.cookie, `/batches/${batch.id}/imports`, body)).json(),
    );

    expect(again.counts).toEqual({ created: 0, updated: 3, skipped: 0 });
    expect(
      await db()
        .select({ username: interns.username, email: interns.email })
        .from(interns)
        .where(eq(interns.airtableRecordId, arjun.id)),
    ).toEqual([{ username: 'arjun.mehta07', email: 'arjun.m@example.com' }]);
  });

  it("doesn't take over an intern imported from another record", async () => {
    const records = vi.fn<AirtableSource['fetchRecords']>(() =>
      Promise.resolve(recorded(['real-columns'])),
    );
    const { setup, pm, batch, preview } = await setUp({ fetchRecords: records });
    const body = { ...source, mapping: realMapping };
    await post(setup, pm.cookie, `/batches/${batch.id}/imports`, body);
    // Another person whose email starts the same way as Rohan's.
    records.mockResolvedValue([
      {
        id: 'recU4v5W6x7Y8z9A0',
        createdTime: '2026-02-23T07:24:01.000Z',
        fields: {
          Name: 'Rohan Dasgupta',
          'Email ID': 'rohan.das@elsewhere.example',
          'Mobile Number': '9800000004',
          'Diploma Branch': 'Civil Engineering',
        },
      },
    ]);

    const previewed = ImportPreview.parse(await (await preview(pm, body)).json());

    expect(previewed.invalid).toEqual([
      { row: 1, username: 'rohan.das', reasons: ['rohan.das belongs to another Airtable record.'] },
    ]);
  });
});
