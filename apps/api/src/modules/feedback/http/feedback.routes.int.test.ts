import {
  BatchDetail,
  type FeedbackEditRequest,
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
            send(setup, 'PATCH', other, path, october),
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

  it('submits a draft; then it changes through PATCH, no longer as a draft', async () => {
    const { setup, mentor, base, create, stored } = await setUp();
    const draft = await viewOf(await create(mentor), 201);
    const path = `${base}/${draft.id}`;

    const submitted = await viewOf(
      await send(setup, 'PUT', mentor, path, { ...october, submit: true }),
      200,
    );
    expect(submitted).toMatchObject({ state: 'submitted', colorCode: 'orange' });
    expect((await stored())?.colorCode).toBe('orange');

    expect(submitted.editedAt).toBeNull();
    const edited = await viewOf(
      await send(setup, 'PATCH', mentor, path, { ...october, body: 'Clearer.' }),
      200,
    );
    expect(edited).toMatchObject({
      body: 'Clearer.',
      colorCode: 'orange',
      state: 'submitted',
      editedAt: '2026-10-24T09:00:00.000Z',
    });

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

/** Yellow by Mo, then a minute later Orange by Mo: the intern is Orange. */
const twoColours = async () => {
  const context = await setUp();
  const { setup, mentor, create } = context;
  const older = await viewOf(
    await create(mentor, { ...october, period: '2026-09-01', colorCode: 'yellow', submit: true }),
    201,
  );
  setup.travel(60_000);
  const newer = await viewOf(await create(mentor, { ...october, submit: true }), 201);
  const edit = (
    entry: FeedbackView,
    change: Partial<FeedbackEditRequest> = {},
    who: Who = mentor,
  ) =>
    send(setup, 'PATCH', who, `${context.base}/${entry.id}`, {
      period: entry.period,
      body: entry.body,
      colorCode: entry.colorCode,
      givesNotice: entry.givesNotice,
      ...change,
    });
  const previousOf = async (entry: FeedbackView) =>
    (await context.list(mentor)).find(({ id }) => id === entry.id)?.previousColorCode;
  return { ...context, older, newer, edit, previousOf };
};

describe('editing submitted feedback (9.8)', () => {
  it("moves the intern's colour only when the newest coloured feedback changes", async () => {
    const { older, newer, edit, stored, previousOf } = await twoColours();
    expect(await previousOf(newer)).toBe('yellow');

    // An older entry: the intern keeps Orange, and the next entry's previous colour follows.
    await viewOf(await edit(older, { colorCode: 'green' }), 200);
    expect((await stored())?.colorCode).toBe('orange');
    expect(await previousOf(newer)).toBe('green');

    // The newest entry: the intern follows it.
    await viewOf(await edit(newer, { colorCode: 'red' }), 200);
    expect((await stored())?.colorCode).toBe('red');
    expect(await previousOf(newer)).toBe('green');
  });

  it('reads each colour change from the coloured feedback just before, skipping no-colour ones', async () => {
    const { setup, mentor, create, newer, previousOf } = await twoColours();
    setup.travel(60_000);
    await viewOf(await create(mentor, { ...october, colorCode: null, submit: true }), 201);
    setup.travel(60_000);
    const third = await viewOf(
      await create(mentor, { ...october, colorCode: 'red', submit: true }),
      201,
    );

    expect(third.previousColorCode).toBe('orange');
    expect(await previousOf(newer)).toBe('yellow');
  });

  it('gives back the colour from before when the newest loses its colour, even none', async () => {
    const { older, newer, edit, stored, previousOf } = await twoColours();

    const plain = await viewOf(await edit(newer, { colorCode: null }), 200);
    expect(plain.previousColorCode).toBeNull();
    expect((await stored())?.colorCode).toBe('yellow');
    expect(await previousOf(older)).toBeNull();

    await viewOf(await edit(older, { colorCode: null }), 200);
    expect((await stored())?.colorCode).toBeNull();
  });

  it('gives notice from the edit day, then withdraws it, both in the status history', async () => {
    const { setup, newer, edit, stored } = await twoColours();
    setup.travel(24 * 60 * 60_000);

    const given = await viewOf(await edit(newer, { givesNotice: true }), 200);
    expect(given).toMatchObject({ givesNotice: true, editedAt: '2026-10-25T09:01:00.000Z' });
    expect(await stored()).toMatchObject({ status: 'on_notice', noticeEndsOn: '2026-11-25' });
    expect((await stored())?.statusEvents.at(-1)).toMatchObject({
      toStatus: 'on_notice',
      noticeStartsOn: '2026-10-25',
      feedbackId: newer.id,
      reason: 'Notice given by editing the October 2026 feedback.',
    });

    await viewOf(await edit(given, { givesNotice: false }), 200);
    const intern = await stored();
    expect(intern).toMatchObject({ status: 'active', noticeEndsOn: null });
    expect(intern?.statusEvents.map(({ toStatus }) => toStatus)).toEqual([
      'active',
      'on_notice',
      'active',
    ]);
    expect(intern?.statusEvents.at(-1)?.reason).toBe(
      'Notice withdrawn by editing the October 2026 feedback.',
    );
  });

  it('refuses to withdraw a notice once the PM lifted it', async () => {
    const { setup, pm, batch, intern, newer, edit, stored } = await twoColours();
    const given = await viewOf(await edit(newer, { givesNotice: true }), 200);
    const lifted = await send(
      setup,
      'POST',
      pm,
      `/batches/${batch.id}/interns/${intern.id}/status-changes`,
      { action: 'lift_notice', reason: 'Improved.' },
    );
    expect(lifted.status).toBe(200);

    const problem = await problemOf(await edit(given, { givesNotice: false }), 409);

    expect(problem).toMatchObject({
      code: 'notice_not_running',
      detail: "This feedback's notice is no longer running, so it can't be withdrawn here.",
    });
    expect((await stored())?.statusEvents).toHaveLength(3);
    // With notice left on, the rest can still change.
    await viewOf(await edit(given, { body: 'Later.' }), 200);
  });

  it('is for its author only, until delivered', async () => {
    const { mentor2, pm, newer, edit } = await twoColours();

    expect((await edit(newer, { body: 'Mine.' }, mentor2)).status).toBe(403);
    expect((await edit(newer, { body: 'Mine.' }, pm)).status).toBe(403);
    await db()
      .update(feedbackTable)
      .set({ state: 'delivered', conversationId: '01890a5d-ac96-774b-bcce-b30209000c01' })
      .where(eq(feedbackTable.id, newer.id));
    expect((await problemOf(await edit(newer, { body: 'Later.' }), 409)).code).toBe(
      'feedback_delivered',
    );
  });

  it("isn't marked edited when nothing changed, and keeps to the batch's months", async () => {
    const { newer, edit } = await twoColours();

    expect((await viewOf(await edit(newer), 200)).editedAt).toBeNull();
    const problem = await problemOf(await edit(newer, { period: '2026-11-01' }), 400);
    expect(problem.errors).toEqual([
      { path: 'period', message: 'Choose a month from July 2026 to October 2026.' },
    ]);
  });

  it('takes an edit giving notice and a new notice one after the other', async () => {
    const { mentor2, newer, edit, create, intern } = await twoColours();

    const responses = await Promise.all([
      edit(newer, { givesNotice: true }),
      create(mentor2, { ...october, givesNotice: true, submit: true }),
    ]);

    // Whichever takes the intern's lock first wins; the other finds the intern on notice.
    const statuses = responses.map(({ status }) => status);
    expect(statuses.filter((status) => status === 409)).toHaveLength(1);
    expect(statuses.filter((status) => status === 200 || status === 201)).toHaveLength(1);
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
