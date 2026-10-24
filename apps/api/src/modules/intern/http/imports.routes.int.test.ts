import {
  BatchDetail,
  ImportPreview,
  InternSummary,
  ProblemDetails,
  type Role,
} from '@feedback-portal/contracts';
import { type LogRecord, reset } from '@logtape/logtape';
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

const testDb = useTestDb();
const db = () => testDb.handle.db;

afterEach(async () => {
  await reset();
});

const recorded = (): readonly AirtableRecord[] =>
  ['page-1', 'page-2'].flatMap((name) => {
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
  const preview = (who: { cookie: string }, body: unknown = source) =>
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
      await preview(pm, { token: '', baseId: 'base', tableId: 'Interns', view: '' }),
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
