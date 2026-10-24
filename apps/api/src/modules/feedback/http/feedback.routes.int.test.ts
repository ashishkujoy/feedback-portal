import {
  BatchDetail,
  FeedbackView,
  InternSummary,
  ProblemDetails,
  type Role,
} from '@feedback-portal/contracts';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { realApp } from '../../../../test/app-deps.ts';
import { useTestDb } from '../../../../test/test-db.ts';
import { giveNotice, terminate } from '../../intern/domain/intern.ts';
import { InternId } from '../../intern/domain/intern-id.ts';
import { newStatusEventId } from '../../intern/domain/status-event-id.ts';
import { createInternRepository } from '../../intern/infrastructure/drizzle-intern-repository.ts';
import { internStatusEvents } from '../../intern/infrastructure/schema.ts';
import { feedback as feedbackTable } from '../infrastructure/schema.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;

type Setup = ReturnType<typeof realApp>;
type Who = Readonly<{ cookie: string }>;

const send = (
  { app, webAppUrl }: Setup,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  who: Who,
  path: string,
  body?: unknown,
) =>
  app.request(path, {
    method,
    headers: {
      cookie: who.cookie,
      origin: webAppUrl,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const problemOf = async (response: Response, status: number) => {
  expect(response.status).toBe(status);
  return ProblemDetails.parse(await response.json());
};

const viewOf = async (response: Response, status: number) => {
  expect(response.status).toBe(status);
  return FeedbackView.parse(await response.json());
};

const october = {
  period: '2026-10-01',
  body: 'Closed `PAY-214` with tests first.',
  colorCode: 'orange',
  givesNotice: false,
} as const;

/**
 * The full app at 24 October 2026 (UTC) with an unassigned admin, the batch's PM, two mentors, an
 * admin assigned as a mentor, and a mentor of another batch; one intern, Ishita.
 */
const setUp = async (at = new Date('2026-10-24T09:00:00Z')) => {
  const setup = realApp(db());
  setup.setTime(at);
  const person = (name: string, roles: [Role, ...Role[]]) => setup.signedInUser({ name, roles });
  const admin = await person('Ada Admin', ['admin']);
  const pm = await person('Pat Manager', ['program_manager']);
  const mentor = await person('Mo Mentor', ['mentor']);
  const mentor2 = await person('Meg Mentor', ['mentor']);
  const mentoringAdmin = await person('Avi Admin', ['admin', 'mentor']);
  const outsider = await person('Oz Outsider', ['mentor']);
  const batchOf = async (name: string, pmId: string) =>
    BatchDetail.parse(
      await (
        await send(setup, 'POST', admin, '/batches', {
          name,
          startDate: '2026-07-06',
          endDate: '2027-12-18',
          programManagerId: pmId,
        })
      ).json(),
    );
  const batch = await batchOf('Batch 2026', pm.user.id);
  await Promise.all(
    [mentor, mentor2, mentoringAdmin].map(async (member) =>
      send(setup, 'POST', admin, `/batches/${batch.id}/mentors`, { userId: member.user.id }),
    ),
  );
  const internOf = async (batchId: string, username: string) =>
    InternSummary.parse(
      await (
        await send(setup, 'POST', pm, `/batches/${batchId}/interns`, {
          username,
          name: 'Ishita Rao',
          email: `${username}@example.com`,
        })
      ).json(),
    );
  const intern = await internOf(batch.id, 'ishita.rao');
  const base = `/batches/${batch.id}/interns/${intern.id}/feedback`;
  const list = async (who: Who) => {
    const response = await send(setup, 'GET', who, base);
    expect(response.status).toBe(200);
    return z.array(FeedbackView).parse(await response.json());
  };
  const create = (who: Who, body: unknown = october) => send(setup, 'POST', who, base, body);
  const stored = () => createInternRepository(db()).findById(InternId.parse(intern.id));
  return {
    setup,
    admin,
    pm,
    mentor,
    mentor2,
    mentoringAdmin,
    outsider,
    batch,
    batchOf,
    intern,
    internOf,
    base,
    list,
    create,
    stored,
  };
};

describe('drafts', () => {
  it('are created, edited, listed and discarded by their author', async () => {
    const { setup, mentor, base, list, create } = await setUp();

    const response = await create(mentor, { ...october, body: '' });
    const draft = await viewOf(response, 201);
    expect(response.headers.get('location')).toBe(`${base}/${draft.id}`);
    expect(draft).toMatchObject({
      state: 'draft',
      body: '',
      colorCode: 'orange',
      author: { id: mentor.user.id, name: 'Mo Mentor', avatarUrl: null },
      submittedAt: null,
      createdAt: '2026-10-24T09:00:00.000Z',
    });

    const edited = await viewOf(
      await send(setup, 'PUT', mentor, `${base}/${draft.id}`, {
        ...october,
        period: '2026-09-01',
        body: 'Half written',
        colorCode: null,
      }),
      200,
    );
    expect(edited).toMatchObject({ period: '2026-09-01', body: 'Half written', colorCode: null });
    expect((await list(mentor)).map(({ id }) => id)).toEqual([draft.id]);

    expect((await send(setup, 'DELETE', mentor, `${base}/${draft.id}`)).status).toBe(204);
    expect(await list(mentor)).toEqual([]);
  });

  it("are invisible to everyone else: someone else's draft is a 404", async () => {
    const { setup, admin, pm, mentor, mentor2, base, list, create } = await setUp();
    const draft = await viewOf(await create(mentor), 201);

    const path = `${base}/${draft.id}`;
    const seen = await Promise.all(
      [pm, mentor2, admin].map(async (other) => ({
        list: await list(other),
        writes: (
          await Promise.all([
            send(setup, 'PUT', other, path, october),
            send(setup, 'PATCH', other, path, { body: 'Mine now' }),
            send(setup, 'DELETE', other, path),
          ])
        ).map(({ status }) => status),
      })),
    );

    // The admin isn't assigned, so their writes are refused before the draft is even looked up.
    expect(seen).toEqual([
      { list: [], writes: [404, 404, 404] },
      { list: [], writes: [404, 404, 404] },
      { list: [], writes: [403, 403, 403] },
    ]);
    expect(await db().select().from(feedbackTable)).toHaveLength(1);
  });
});

describe('submitting', () => {
  it('in one step sets the colour, and with notice starts it today', async () => {
    const { mentor, create, stored } = await setUp();

    const entry = await viewOf(
      await create(mentor, { ...october, colorCode: 'red', givesNotice: true, submit: true }),
      201,
    );

    expect(entry).toMatchObject({
      state: 'submitted',
      colorCode: 'red',
      previousColorCode: null,
      givesNotice: true,
      submittedAt: '2026-10-24T09:00:00.000Z',
    });
    const intern = await stored();
    expect(intern).toMatchObject({
      colorCode: 'red',
      status: 'on_notice',
      noticeEndsOn: '2026-11-24',
    });
    expect(intern?.statusEvents.at(-1)).toMatchObject({
      toStatus: 'on_notice',
      noticeStartsOn: '2026-10-24',
      feedbackId: entry.id,
      actorId: mentor.user.id,
      reason: 'Notice given in the October 2026 feedback.',
    });
  });

  it('leaves nothing behind when a one-step submission is refused', async () => {
    const { mentor, create, stored } = await setUp();

    const problem = await problemOf(
      await create(mentor, { ...october, body: ' ', submit: true }),
      400,
    );

    expect(problem.errors).toEqual([
      { path: 'body', message: 'Write your feedback before submitting.' },
    ]);
    expect(await db().select().from(feedbackTable)).toEqual([]);
    expect((await stored())?.colorCode).toBeNull();
  });

  it('submits a draft; then only its text can change', async () => {
    const { setup, mentor, base, create, stored } = await setUp();
    const draft = await viewOf(await create(mentor), 201);
    const path = `${base}/${draft.id}`;

    const submitted = await viewOf(
      await send(setup, 'PUT', mentor, path, { ...october, submit: true }),
      200,
    );
    expect(submitted).toMatchObject({ state: 'submitted', colorCode: 'orange' });
    expect((await stored())?.colorCode).toBe('orange');

    const edited = await viewOf(
      await send(setup, 'PATCH', mentor, path, { body: 'Clearer.' }),
      200,
    );
    expect(edited).toMatchObject({ body: 'Clearer.', colorCode: 'orange', state: 'submitted' });

    const again = await problemOf(
      await send(setup, 'PUT', mentor, path, { ...october, colorCode: 'red' }),
      409,
    );
    expect(again.code).toBe('feedback_not_draft');
    expect((await problemOf(await send(setup, 'DELETE', mentor, path), 409)).code).toBe(
      'feedback_not_draft',
    );
  });

  it('takes two notices for the same intern one after the other', async () => {
    const { mentor, mentor2, create, intern } = await setUp();
    const notice = { ...october, givesNotice: true, submit: true };

    const responses = await Promise.all([create(mentor, notice), create(mentor2, notice)]);

    expect(responses.map(({ status }) => status).toSorted((a, b) => a - b)).toEqual([201, 409]);
    const refused = responses.find(({ status }) => status === 409);
    expect(ProblemDetails.parse(await refused?.json()).code).toBe('intern_not_active');
    const notices = await db()
      .select()
      .from(internStatusEvents)
      .where(eq(internStatusEvents.internId, intern.id));
    expect(notices.filter(({ toStatus }) => toStatus === 'on_notice')).toHaveLength(1);
  });
});

describe('the list', () => {
  it("shows the viewer's drafts first, then the newest submitted", async () => {
    const { setup, mentor, mentor2, list, create } = await setUp();
    const older = await viewOf(await create(mentor2, { ...october, submit: true }), 201);
    setup.travel(60_000);
    const newer = await viewOf(
      await create(mentor, { ...october, colorCode: null, submit: true }),
      201,
    );
    const draft = await viewOf(await create(mentor), 201);
    await viewOf(await create(mentor2), 201);

    expect((await list(mentor)).map(({ id }) => id)).toEqual([draft.id, newer.id, older.id]);
  });
});

describe('access', () => {
  it('lets the PM and an admin assigned as mentor write', async () => {
    const { pm, mentoringAdmin, create } = await setUp();

    expect((await create(pm)).status).toBe(201);
    expect((await create(mentoringAdmin)).status).toBe(201);
  });

  it('lets an unassigned admin read submitted feedback but not write', async () => {
    const { admin, mentor, list, create } = await setUp();
    const entry = await viewOf(await create(mentor, { ...october, submit: true }), 201);

    expect((await list(admin)).map(({ id }) => id)).toEqual([entry.id]);
    const problem = await problemOf(await create(admin), 403);
    expect(problem.detail).toBe("Only this batch's mentors and programme manager write feedback.");
  });

  it('is a 404 for a mentor of another batch, or an intern of another batch', async () => {
    const { setup, pm, outsider, batch, batchOf, internOf, base, create } = await setUp();

    expect((await send(setup, 'GET', outsider, base)).status).toBe(404);
    expect((await create(outsider)).status).toBe(404);
    const other = await batchOf('Batch 2026 B', pm.user.id);
    const stranger = await internOf(other.id, 'zoya.ansari');
    expect(
      (await send(setup, 'GET', pm, `/batches/${batch.id}/interns/${stranger.id}/feedback`)).status,
    ).toBe(404);
  });

  it('is a 401 when signed out', async () => {
    const { setup, base } = await setUp();

    expect((await send(setup, 'GET', { cookie: '' }, base)).status).toBe(401);
  });

  it('reads an archived batch but refuses writes', async () => {
    const { setup, admin, mentor, batch, list, create } = await setUp();
    const entry = await viewOf(await create(mentor, { ...october, submit: true }), 201);
    await send(setup, 'POST', admin, `/batches/${batch.id}/archive`);

    expect((await list(mentor)).map(({ id }) => id)).toEqual([entry.id]);
    expect((await problemOf(await create(mentor), 409)).code).toBe('batch_archived');
  });

  it('refuses feedback for a read-only intern, but a draft can still be discarded', async () => {
    const { setup, pm, mentor, base, create, stored } = await setUp();
    const draft = await viewOf(await create(mentor), 201);
    const intern = await stored();
    if (!intern) throw new Error('intern missing');
    const change = { reason: 'Notice period ended.', actor: pm.user.id, now: new Date() };
    await createInternRepository(db()).save(
      terminate(
        giveNotice(intern, {
          ...change,
          eventId: newStatusEventId(),
          startsOn: '2026-09-01',
          feedbackId: null,
        }),
        { ...change, eventId: newStatusEventId() },
      ),
    );

    expect((await problemOf(await create(mentor), 409)).code).toBe('intern_read_only');
    expect((await send(setup, 'DELETE', mentor, `${base}/${draft.id}`)).status).toBe(204);
  });
});

describe('validation', () => {
  it('reports malformed fields', async () => {
    const { mentor, create } = await setUp();

    const problem = await problemOf(
      await create(mentor, { period: 'October', body: 1, colorCode: 'purple' }),
      400,
    );

    expect(problem.errors?.map(({ path }) => path)).toEqual([
      'period',
      'body',
      'colorCode',
      'givesNotice',
    ]);
  });

  it('refuses a month before the batch or after this one', async () => {
    const { mentor, create } = await setUp();

    const problems = await Promise.all(
      ['2026-06-01', '2026-11-01'].map(async (period) =>
        problemOf(await create(mentor, { ...october, period }), 400),
      ),
    );

    for (const problem of problems) {
      expect(problem.errors).toEqual([
        { path: 'period', message: 'Choose a month from July 2026 to October 2026.' },
      ]);
    }
  });
});

describe('UTC (9.3 decision 3)', () => {
  it("uses the UTC date for today, even where it's already tomorrow", async () => {
    // 23:30 UTC on 31 October is 05:00 on 1 November in India.
    const { mentor, create, stored } = await setUp(new Date('2026-10-31T23:30:00Z'));

    const november = await problemOf(
      await create(mentor, { ...october, period: '2026-11-01' }),
      400,
    );
    expect(november.errors?.[0]?.path).toBe('period');

    const entry = await viewOf(
      await create(mentor, { ...october, givesNotice: true, submit: true }),
      201,
    );
    expect(entry.submittedAt).toBe('2026-10-31T23:30:00.000Z');
    expect((await stored())?.statusEvents.at(-1)).toMatchObject({
      noticeStartsOn: '2026-10-31',
      noticeEndsOn: '2026-11-30',
    });
  });
});
