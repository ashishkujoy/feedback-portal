import { BatchDetail, BatchSummary, ProblemDetails, type Role } from '@feedback-portal/contracts';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from 'pg';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { realApp } from '../../../../test/app-deps.ts';
import { useTestDb } from '../../../../test/test-db.ts';
import { peopleAdminLock } from '../../../shared/db/advisory-lock.ts';
import { newUserId } from '../../identity/domain/user-id.ts';
import { newBatchId } from '../domain/batch-id.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;

type Setup = ReturnType<typeof realApp>;

const call = (
  { app, webAppUrl }: Setup,
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
) =>
  app.request(path, {
    method,
    headers: {
      cookie,
      origin: webAppUrl,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const problemOf = async (response: Response, status: number) => {
  expect(response.status).toBe(status);
  return ProblemDetails.parse(await response.json());
};

const detailOf = async (response: Response, status = 200) => {
  expect(response.status).toBe(status);
  return BatchDetail.parse(await response.json());
};

/** The full app with a signed-in admin, a PM and a mentor (all with sessions). */
const setUp = async () => {
  const setup = realApp(db());
  const person = (name: string, roles: [Role, ...Role[]], active = true) =>
    setup.signedInUser({ name, roles, active });
  const admin = await person('Ada Admin', ['admin']);
  const pm = await person('Pat Manager', ['program_manager']);
  const mentor = await person('Mo Mentor', ['mentor']);
  const as = (who: { cookie: string }) => ({
    get: (path: string) => call(setup, who.cookie, 'GET', path),
    post: (path: string, body?: unknown) => call(setup, who.cookie, 'POST', path, body),
    put: (path: string, body: unknown) => call(setup, who.cookie, 'PUT', path, body),
    del: (path: string) => call(setup, who.cookie, 'DELETE', path),
  });
  const create = async (overrides: Record<string, unknown> = {}) =>
    detailOf(
      await as(admin).post('/batches', {
        name: 'Batch 1',
        startDate: '2027-01-11',
        endDate: '2028-06-25',
        programManagerId: pm.user.id,
        ...overrides,
      }),
      201,
    );
  return { setup, person, admin, pm, mentor, as, create };
};

const current = (batch: BatchDetail) =>
  batch.members
    .filter((member) => member.unassignedAt === null)
    .map((member) => [member.user.name, member.role]);

describe('/batches access', () => {
  const id = newBatchId();
  const routes: [string, string, unknown?][] = [
    ['GET', '/batches'],
    [
      'POST',
      '/batches',
      { name: 'B', startDate: '2027-01-11', endDate: '2028-01-11', programManagerId: newUserId() },
    ],
    ['GET', `/batches/${id}`],
    ['POST', `/batches/${id}/archive`],
    ['PUT', `/batches/${id}/program-manager`, { userId: newUserId() }],
    ['POST', `/batches/${id}/mentors`, { userId: newUserId() }],
    ['DELETE', `/batches/${id}/mentors/${newUserId()}`],
  ];

  it.each(routes)('%s %s: 401 when signed out', async (method, path, body) => {
    const setup = realApp(db());

    expect((await problemOf(await call(setup, '', method, path, body), 401)).code).toBe(
      'unauthenticated',
    );
  });

  it.each(routes)('%s %s: 403 for a mentor', async (method, path, body) => {
    const { setup, mentor } = await setUp();

    expect((await problemOf(await call(setup, mentor.cookie, method, path, body), 403)).code).toBe(
      'forbidden',
    );
  });

  it.each(routes.slice(0, 5))('%s %s: 403 for a PM', async (method, path, body) => {
    const { setup, pm } = await setUp();

    expect((await problemOf(await call(setup, pm.cookie, method, path, body), 403)).code).toBe(
      'forbidden',
    );
  });
});

describe('POST /batches', () => {
  it('creates a batch with its PM as the only member', async () => {
    const { as, admin, pm } = await setUp();

    const response = await as(admin).post('/batches', {
      name: ' Batch 1 ',
      startDate: '2027-01-11',
      endDate: '2028-06-25',
      programManagerId: pm.user.id,
    });

    const batch = await detailOf(response, 201);
    expect(response.headers.get('location')).toBe(`/batches/${batch.id}`);
    expect(batch).toMatchObject({
      name: 'Batch 1',
      startDate: '2027-01-11',
      endDate: '2028-06-25',
      isArchived: false,
      programManager: { id: pm.user.id, name: 'Pat Manager', avatarUrl: null },
      mentorCount: 0,
    });
    expect(current(batch)).toEqual([['Pat Manager', 'program_manager']]);
  });

  it('reports every invalid field', async () => {
    const { as, admin } = await setUp();

    const problem = await problemOf(
      await as(admin).post('/batches', {
        name: '',
        startDate: '2027-02-30',
        endDate: '',
        programManagerId: 'x',
      }),
      400,
    );
    expect(problem.errors?.map((issue) => issue.path)).toEqual([
      'name',
      'startDate',
      'endDate',
      'programManagerId',
    ]);
  });

  it('rejects a name already taken, in any case', async () => {
    const { as, admin, create } = await setUp();
    await create({ name: 'Batch One' });

    const response = await as(admin).post('/batches', {
      name: 'batch ONE',
      startDate: '2027-01-11',
      endDate: '2028-06-25',
      programManagerId: (await create({ name: 'Other' })).programManager.id,
    });

    expect((await problemOf(response, 409)).code).toBe('batch_name_taken');
  });

  it('needs an active PM who holds the Programme manager role', async () => {
    const { as, admin, mentor, person } = await setUp();
    const gone = await person('Gone PM', ['program_manager'], false);
    const body = { name: 'B', startDate: '2027-01-11', endDate: '2028-06-25' };

    const notPm = await as(admin).post('/batches', { ...body, programManagerId: mentor.user.id });
    const inactive = await as(admin).post('/batches', { ...body, programManagerId: gone.user.id });
    const unknown = await as(admin).post('/batches', { ...body, programManagerId: newUserId() });

    expect((await problemOf(notPm, 409)).code).toBe('member_role_mismatch');
    expect((await problemOf(inactive, 409)).code).toBe('member_inactive');
    expect((await problemOf(unknown, 404)).detail).toBe('User not found');
  });
});

describe('GET /batches and /batches/:id', () => {
  it('lists active batches first, newest first', async () => {
    const { as, admin, create } = await setUp();
    await create({ name: 'Older', startDate: '2026-01-12' });
    const archived = await create({ name: 'Archived', startDate: '2027-06-01' });
    await as(admin).post(`/batches/${archived.id}/archive`);
    await create({ name: 'Newer', startDate: '2027-01-11' });

    const response = await as(admin).get('/batches');

    expect(response.status).toBe(200);
    const list = z.array(BatchSummary).parse(await response.json());
    expect(list.map((batch) => [batch.name, batch.isArchived])).toEqual([
      ['Newer', false],
      ['Older', false],
      ['Archived', true],
    ]);
  });

  it('gives one batch, or 404', async () => {
    const { as, admin, create } = await setUp();
    const batch = await create();

    expect(await detailOf(await as(admin).get(`/batches/${batch.id}`))).toEqual(batch);
    expect((await problemOf(await as(admin).get(`/batches/${newBatchId()}`), 404)).detail).toBe(
      'Batch not found',
    );
  });
});

describe('PUT /batches/:id/program-manager', () => {
  it("replaces the PM, keeping the old one's assignment as history", async () => {
    const { as, admin, create, person } = await setUp();
    const batch = await create();
    const next = await person('Nia Next', ['program_manager']);

    const after = await detailOf(
      await as(admin).put(`/batches/${batch.id}/program-manager`, { userId: next.user.id }),
    );

    expect(after.programManager.name).toBe('Nia Next');
    expect(current(after)).toEqual([['Nia Next', 'program_manager']]);
    expect(after.members.map((member) => [member.user.name, member.unassignedAt !== null])).toEqual(
      [
        ['Pat Manager', true],
        ['Nia Next', false],
      ],
    );
    // The same person again changes nothing.
    expect(
      await detailOf(
        await as(admin).put(`/batches/${batch.id}/program-manager`, { userId: next.user.id }),
      ),
    ).toEqual(after);
  });
});

describe('mentors', () => {
  it('can be assigned and unassigned by an admin; the history row stays', async () => {
    const { as, admin, mentor, create } = await setUp();
    const batch = await create();

    const assigned = await detailOf(
      await as(admin).post(`/batches/${batch.id}/mentors`, { userId: mentor.user.id }),
    );
    expect(assigned.mentorCount).toBe(1);
    expect(
      await detailOf(
        await as(admin).post(`/batches/${batch.id}/mentors`, { userId: mentor.user.id }),
      ),
    ).toEqual(assigned);

    const removed = await detailOf(
      await as(admin).del(`/batches/${batch.id}/mentors/${mentor.user.id}`),
    );
    expect(removed.mentorCount).toBe(0);
    expect(removed.members).toHaveLength(2);
    expect(
      await detailOf(await as(admin).del(`/batches/${batch.id}/mentors/${mentor.user.id}`)),
    ).toEqual(removed);
  });

  it("can be changed by the batch's current PM, but not another PM's batch", async () => {
    const { as, pm, mentor, create, person } = await setUp();
    const mine = await create();
    const otherPm = await person('Other PM', ['program_manager']);
    const theirs = await create({ name: 'Theirs', programManagerId: otherPm.user.id });

    const assigned = await as(pm).post(`/batches/${mine.id}/mentors`, { userId: mentor.user.id });
    expect((await detailOf(assigned)).mentorCount).toBe(1);
    expect(
      (await detailOf(await as(pm).del(`/batches/${mine.id}/mentors/${mentor.user.id}`)))
        .mentorCount,
    ).toBe(0);

    const elsewhere = await as(pm).post(`/batches/${theirs.id}/mentors`, {
      userId: mentor.user.id,
    });
    expect((await problemOf(elsewhere, 403)).code).toBe('forbidden');
    expect(
      (await problemOf(await as(pm).del(`/batches/${theirs.id}/mentors/${mentor.user.id}`), 403))
        .code,
    ).toBe('forbidden');
  });

  it('stops working for a PM once they are replaced', async () => {
    const { as, admin, pm, mentor, create, person } = await setUp();
    const batch = await create();
    const next = await person('Nia Next', ['program_manager']);
    await as(admin).put(`/batches/${batch.id}/program-manager`, { userId: next.user.id });

    const response = await as(pm).post(`/batches/${batch.id}/mentors`, { userId: mentor.user.id });

    expect((await problemOf(response, 403)).code).toBe('forbidden');
  });

  it('needs the Mentor role', async () => {
    const { as, admin, pm, create } = await setUp();
    const batch = await create();

    const response = await as(admin).post(`/batches/${batch.id}/mentors`, { userId: pm.user.id });

    expect((await problemOf(response, 409)).code).toBe('member_role_mismatch');
  });

  it("can't remove the PM through the mentor route", async () => {
    const { as, admin, pm, create } = await setUp();
    const batch = await create();

    const after = await detailOf(await as(admin).del(`/batches/${batch.id}/mentors/${pm.user.id}`));

    expect(current(after)).toEqual([['Pat Manager', 'program_manager']]);
  });

  it('404s for an unknown batch or user', async () => {
    const { as, admin, create } = await setUp();
    const batch = await create();

    expect(
      (
        await problemOf(
          await as(admin).post(`/batches/${newBatchId()}/mentors`, { userId: newUserId() }),
          404,
        )
      ).detail,
    ).toBe('Batch not found');
    expect(
      (
        await problemOf(
          await as(admin).post(`/batches/${batch.id}/mentors`, { userId: newUserId() }),
          404,
        )
      ).detail,
    ).toBe('User not found');
  });
});

describe('POST /batches/:id/archive', () => {
  it('archives once, then every change is refused', async () => {
    const { as, admin, mentor, create, person } = await setUp();
    const batch = await create();

    const archived = await detailOf(await as(admin).post(`/batches/${batch.id}/archive`));
    expect(archived.isArchived).toBe(true);
    expect(await detailOf(await as(admin).post(`/batches/${batch.id}/archive`))).toEqual(archived);

    const next = await person('Nia Next', ['program_manager']);
    const changes = [
      await as(admin).post(`/batches/${batch.id}/mentors`, { userId: mentor.user.id }),
      await as(admin).del(`/batches/${batch.id}/mentors/${mentor.user.id}`),
      await as(admin).put(`/batches/${batch.id}/program-manager`, { userId: next.user.id }),
    ];
    const codes = await Promise.all(
      changes.map(async (response) => (await problemOf(response, 409)).code),
    );
    expect(codes).toEqual(['batch_archived', 'batch_archived', 'batch_archived']);
  });
});

describe('the people-admin lock', () => {
  it('makes a batch change wait while a user change holds it', async () => {
    const { as, admin, mentor, create } = await setUp();
    const batch = await create();
    const holder = new Client({ connectionString: testDb.url });
    await holder.connect();
    try {
      await holder.query('begin');
      await holder.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
        peopleAdminLock,
      ]);
      let settled = false;
      const pending = Promise.resolve(
        as(admin).post(`/batches/${batch.id}/mentors`, { userId: mentor.user.id }),
      ).finally(() => {
        settled = true;
      });
      await sleep(200);
      expect(settled).toBe(false);
      await holder.query('commit');
      expect((await detailOf(await pending)).mentorCount).toBe(1);
    } finally {
      await holder.end();
    }
  });
});
