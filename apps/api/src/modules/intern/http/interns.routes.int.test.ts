import {
  BatchDetail,
  BatchSummary,
  InternDetail,
  InternSummary,
  ProblemDetails,
  type Role,
} from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { realApp } from '../../../../test/app-deps.ts';
import { useTestDb } from '../../../../test/test-db.ts';
import { newBatchId } from '../../cohort/domain/batch-id.ts';
import { giveNotice } from '../domain/intern.ts';
import { InternId, newInternId } from '../domain/intern-id.ts';
import { newStatusEventId } from '../domain/status-event-id.ts';
import { createInternRepository } from '../infrastructure/drizzle-intern-repository.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;

type Setup = ReturnType<typeof realApp>;

const get = ({ app }: Setup, cookie: string, path: string) =>
  app.request(path, { headers: { cookie } });

const post = ({ app, webAppUrl }: Setup, cookie: string, path: string, body?: unknown) =>
  app.request(path, {
    method: 'POST',
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

const ishita = { username: 'ishita.rao', name: 'Ishita Rao', email: 'ishita@example.com' };

/** The full app with a signed-in admin, the batch's PM and its mentor, and the batch. */
const setUp = async () => {
  const setup = realApp(db());
  const person = (name: string, roles: [Role, ...Role[]]) => setup.signedInUser({ name, roles });
  const admin = await person('Ada Admin', ['admin']);
  const pm = await person('Pat Manager', ['program_manager']);
  // A PM elsewhere who mentors here: they pass the role check, but don't run this batch.
  const mentor = await person('Mo Mentor', ['program_manager', 'mentor']);
  const created = await post(setup, admin.cookie, '/batches', {
    name: 'Batch 1',
    startDate: '2027-01-11',
    endDate: '2028-06-25',
    programManagerId: pm.user.id,
  });
  const batch = BatchDetail.parse(await created.json());
  await post(setup, admin.cookie, `/batches/${batch.id}/mentors`, { userId: mentor.user.id });
  const add = (who: { cookie: string }, body: unknown = ishita, batchId = batch.id) =>
    post(setup, who.cookie, `/batches/${batchId}/interns`, body);
  const list = (who: { cookie: string }, batchId = batch.id) =>
    get(setup, who.cookie, `/batches/${batchId}/interns`);
  return { setup, person, admin, pm, mentor, batch, add, list };
};

describe('POST /batches/:batchId/interns', () => {
  it('adds an active intern, normalised, with its onboarding event', async () => {
    const { pm, batch, add } = await setUp();

    const response = await add(pm, {
      username: ' @Ishita.Rao ',
      name: ' Ishita Rao ',
      email: 'Ishita@Example.COM',
      phone: '',
      diplomaBranch: 'Mechanical',
      interviewNotes: '**Strong** in maths',
    });

    expect(response.status).toBe(201);
    const intern = InternSummary.parse(await response.json());
    expect(intern).toEqual({
      id: expect.any(String),
      batchId: batch.id,
      username: 'ishita.rao',
      name: 'Ishita Rao',
      email: 'ishita@example.com',
      status: 'active',
      colorCode: null,
      noticeEndsOn: null,
    });
    expect(response.headers.get('location')).toBe(`/batches/${batch.id}/interns/${intern.id}`);
    const saved = await createInternRepository(db()).findById(InternId.parse(intern.id));
    expect(saved).toMatchObject({
      phone: null,
      diplomaBranch: 'Mechanical',
      parentNames: null,
      interviewNotes: '**Strong** in maths',
    });
    expect(saved?.statusEvents).toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: 'active', actorId: pm.user.id }),
    ]);
  });

  it('reports every invalid field', async () => {
    const { pm, add } = await setUp();

    const problem = await problemOf(
      await add(pm, { username: 'ishita rao', name: ' ', email: 'nope', phone: 'x'.repeat(51) }),
      400,
    );

    expect(problem.code).toBe('validation_failed');
    expect(problem.errors?.map((issue) => issue.path)).toEqual([
      'username',
      'name',
      'email',
      'phone',
    ]);
  });

  it('rejects a username already in the batch, in any case', async () => {
    const { pm, add } = await setUp();
    await add(pm);

    const problem = await problemOf(await add(pm, { ...ishita, username: 'ISHITA.rao' }), 409);

    expect(problem.code).toBe('intern_username_taken');
  });

  describe('access', () => {
    it('is 401 when signed out', async () => {
      const { setup, batch } = await setUp();

      expect(
        (await problemOf(await post(setup, '', `/batches/${batch.id}/interns`, ishita), 401)).code,
      ).toBe('unauthenticated');
    });

    it("is 403 for one of the batch's mentors", async () => {
      const { mentor, person, admin, setup, batch, add } = await setUp();
      const mentorOnly = await person('Mia Mentor', ['mentor']);
      await post(setup, admin.cookie, `/batches/${batch.id}/mentors`, {
        userId: mentorOnly.user.id,
      });

      expect((await problemOf(await add(mentor), 403)).code).toBe('forbidden');
      expect((await problemOf(await add(mentorOnly), 403)).code).toBe('forbidden');
    });

    it("is 404 for a PM who isn't on the batch", async () => {
      const { person, add } = await setUp();
      const otherPm = await person('Oli Other', ['program_manager']);

      expect((await problemOf(await add(otherPm), 404)).code).toBe('not_found');
    });

    it("is open to the batch's PM and to admins", async () => {
      const { pm, admin, add } = await setUp();

      expect((await add(pm)).status).toBe(201);
      expect((await add(admin, { ...ishita, username: 'kabir.s' })).status).toBe(201);
    });

    it('is 409 on an archived batch', async () => {
      const { setup, admin, batch, add } = await setUp();
      await post(setup, admin.cookie, `/batches/${batch.id}/archive`);

      expect((await problemOf(await add(admin), 409)).code).toBe('batch_archived');
    });

    it('is 404 for a batch that does not exist', async () => {
      const { admin, add } = await setUp();

      expect((await problemOf(await add(admin, ishita, newBatchId()), 404)).code).toBe('not_found');
    });
  });
});

const namesOf = async (response: Response) => {
  expect(response.status).toBe(200);
  return z
    .array(InternSummary)
    .parse(await response.json())
    .map((intern) => intern.name);
};

describe('GET /batches/:batchId/interns', () => {
  it("lists the batch's interns by name, ignoring case", async () => {
    const { pm, add, list } = await setUp();
    await Promise.all(
      [
        ['zoya', 'Zoya Ansari'],
        ['aarav', 'aarav Sharma'],
        ['ishita', 'Ishita Rao'],
      ].map(async ([username = '', name]) =>
        add(pm, { username, name, email: `${username}@example.com` }),
      ),
    );

    expect(await namesOf(await list(pm))).toEqual(['aarav Sharma', 'Ishita Rao', 'Zoya Ansari']);
  });

  it('lists only that batch', async () => {
    const { setup, admin, pm, add, list } = await setUp();
    const other = BatchDetail.parse(
      await (
        await post(setup, admin.cookie, '/batches', {
          name: 'Batch 2',
          startDate: '2027-01-11',
          endDate: '2028-06-25',
          programManagerId: pm.user.id,
        })
      ).json(),
    );
    await add(pm);
    await add(pm, { ...ishita, username: 'kabir', name: 'Kabir Nair' }, other.id);

    expect(await namesOf(await list(pm))).toEqual(['Ishita Rao']);
  });

  it("is open to the batch's PM, its mentors and admins", async () => {
    const { pm, mentor, admin, add, list } = await setUp();
    await add(pm);

    const lists = await Promise.all(
      [pm, mentor, admin].map(async (who) => namesOf(await list(who))),
    );

    expect(lists).toEqual([['Ishita Rao'], ['Ishita Rao'], ['Ishita Rao']]);
  });

  it('is still readable once the batch is archived', async () => {
    const { setup, admin, pm, batch, add, list } = await setUp();
    await add(pm);
    await post(setup, admin.cookie, `/batches/${batch.id}/archive`);

    expect(await namesOf(await list(pm))).toEqual(['Ishita Rao']);
  });

  it("is 404 for someone who isn't on the batch, and for an unknown batch", async () => {
    const { person, admin, list } = await setUp();
    const outsider = await person('Oli Other', ['mentor']);

    expect((await problemOf(await list(outsider), 404)).code).toBe('not_found');
    expect((await problemOf(await list(admin, newBatchId()), 404)).code).toBe('not_found');
  });

  it('is 401 when signed out', async () => {
    const { setup, batch } = await setUp();

    expect((await problemOf(await get(setup, '', `/batches/${batch.id}/interns`), 401)).code).toBe(
      'unauthenticated',
    );
  });
});

describe('the batch counts', () => {
  it('include the interns once they are added', async () => {
    const { setup, admin, pm, batch, add } = await setUp();
    // A second, later batch without interns: listed first (newest start), with zeros.
    await post(setup, admin.cookie, '/batches', {
      name: 'Batch 2',
      startDate: '2027-07-12',
      endDate: '2028-12-22',
      programManagerId: pm.user.id,
    });
    await add(pm);
    await add(pm, { ...ishita, username: 'kabir', name: 'Kabir Nair' });

    const detail = BatchDetail.parse(
      await (await get(setup, pm.cookie, `/batches/${batch.id}`)).json(),
    );
    const summaries = z
      .array(BatchSummary)
      .parse(await (await get(setup, pm.cookie, '/batches')).json());

    const expected = {
      total: 2,
      onNotice: 0,
      terminated: 0,
      colours: {
        green: 0,
        yellow: 0,
        borderline_yellow: 0,
        orange: 0,
        borderline_red: 0,
        red: 0,
        none: 2,
      },
    };
    expect(detail.interns).toEqual(expected);
    expect(summaries.map((summary) => [summary.name, summary.interns.total])).toEqual([
      ['Batch 2', 0],
      ['Batch 1', 2],
    ]);
    expect(summaries[1]?.interns).toEqual(expected);
  });
});

const addedOf = async (response: Response) => InternSummary.parse(await response.json());

describe('GET /batches/:batchId/interns/:internId', () => {
  it('shows the profile: details, how they arrived, and the history newest first', async () => {
    const { setup, pm, batch, add } = await setUp();
    const { id } = await addedOf(
      await add(pm, {
        ...ishita,
        phone: '+91 98450 12345',
        diplomaBranch: 'Computer Engineering',
        interviewNotes: '### Technical round',
      }),
    );
    // A later change, made with the domain as 7.6 will (there's no endpoint for it yet).
    const repo = createInternRepository(db());
    const saved = await repo.findById(InternId.parse(id));
    if (!saved) throw new Error('expected the intern');
    await repo.save(
      giveNotice(saved, {
        eventId: newStatusEventId(),
        reason: 'Missed every deadline',
        actor: pm.user.id,
        now: new Date(Date.now() + 60_000),
        startsOn: '2027-04-01',
        feedbackId: null,
      }),
    );

    const response = await get(setup, pm.cookie, `/batches/${batch.id}/interns/${id}`);

    expect(response.status).toBe(200);
    const detail = InternDetail.parse(await response.json());
    expect(detail).toMatchObject({
      id,
      batchId: batch.id,
      username: 'ishita.rao',
      status: 'on_notice',
      noticeEndsOn: '2027-05-01',
      phone: '+91 98450 12345',
      diplomaBranch: 'Computer Engineering',
      parentNames: null,
      interviewNotes: '### Technical round',
      source: 'manual',
      addedBy: { id: pm.user.id, name: 'Pat Manager' },
    });
    expect(
      detail.statusEvents.map((event) => [
        event.fromStatus,
        event.toStatus,
        event.reason,
        event.noticeEndsOn,
        event.actor.name,
      ]),
    ).toEqual([
      ['active', 'on_notice', 'Missed every deadline', '2027-05-01', 'Pat Manager'],
      [null, 'active', null, null, 'Pat Manager'],
    ]);
  });

  it("is open to the batch's PM, its mentors and admins", async () => {
    const { setup, pm, mentor, admin, batch, add } = await setUp();
    const { id } = await addedOf(await add(pm));

    const statuses = await Promise.all(
      [pm, mentor, admin].map(
        async (who) => (await get(setup, who.cookie, `/batches/${batch.id}/interns/${id}`)).status,
      ),
    );

    expect(statuses).toEqual([200, 200, 200]);
  });

  it("is 404 for someone who isn't on the batch, an unknown intern, or another batch's intern", async () => {
    const { setup, person, admin, pm, batch, add } = await setUp();
    const { id } = await addedOf(await add(pm));
    const outsider = await person('Oli Other', ['mentor']);
    const other = BatchDetail.parse(
      await (
        await post(setup, admin.cookie, '/batches', {
          name: 'Batch 2',
          startDate: '2027-01-11',
          endDate: '2028-06-25',
          programManagerId: pm.user.id,
        })
      ).json(),
    );

    const codes = await Promise.all(
      (
        [
          [outsider, `/batches/${batch.id}/interns/${id}`],
          [admin, `/batches/${batch.id}/interns/${newInternId()}`],
          [admin, `/batches/${other.id}/interns/${id}`],
        ] as const
      ).map(async ([who, path]) => (await problemOf(await get(setup, who.cookie, path), 404)).code),
    );

    expect(codes).toEqual(['not_found', 'not_found', 'not_found']);
  });

  it('is 401 when signed out', async () => {
    const { setup, pm, batch, add } = await setUp();
    const { id } = await addedOf(await add(pm));

    expect(
      (await problemOf(await get(setup, '', `/batches/${batch.id}/interns/${id}`), 401)).code,
    ).toBe('unauthenticated');
  });
});
