import { BatchDetail, InternSummary, ProblemDetails, type Role } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { realApp } from '../../../../test/app-deps.ts';
import { useTestDb } from '../../../../test/test-db.ts';
import { newBatchId } from '../../cohort/domain/batch-id.ts';
import { InternId } from '../domain/intern-id.ts';
import { createInternRepository } from '../infrastructure/drizzle-intern-repository.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;

type Setup = ReturnType<typeof realApp>;

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
  return { setup, person, admin, pm, mentor, batch, add };
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
