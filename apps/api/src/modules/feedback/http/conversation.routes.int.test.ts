import {
  BatchDetail,
  ConversationView,
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
import { InternId } from '../../intern/domain/intern-id.ts';
import { createInternRepository } from '../../intern/infrastructure/drizzle-intern-repository.ts';
import {
  conversations as conversationTable,
  feedback as feedbackTable,
} from '../infrastructure/schema.ts';

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

/** The setup plus two submitted entries (Mo's on 12 Oct, Meg's on 20 Oct), today 24 Oct. */
const withFeedback = async () => {
  const context = await setUp();
  const { setup, mentor, mentor2, create } = context;
  const created = await viewOf(await create(mentor, { ...october, submit: true }), 201);
  const second = await viewOf(
    await create(mentor2, { ...october, colorCode: null, submit: true }),
    201,
  );
  // Backdated rather than travelled to, so the sessions signed in today stay valid.
  await db()
    .update(feedbackTable)
    .set({ submittedAt: new Date('2026-10-12T09:00:00Z') })
    .where(eq(feedbackTable.id, created.id));
  const first = { ...created, submittedAt: '2026-10-12T09:00:00.000Z' };
  const path = `/batches/${context.batch.id}/interns/${context.intern.id}/conversations`;
  const recordAs = (who: Who, body: unknown) => send(setup, 'POST', who, path, body);
  const list = async (who: Who) => {
    const response = await send(setup, 'GET', who, path);
    expect(response.status).toBe(200);
    return z.array(ConversationView).parse(await response.json());
  };
  return { ...context, first, second, path, recordAs, listConversations: list };
};

const notes = 'Delivered in the weekly 1:1.\n\n- Pleased with the pairing feedback';

const conversationOf = async (response: Response, status: number) => {
  expect(response.status).toBe(status);
  return ConversationView.parse(await response.json());
};

describe('recording a conversation', () => {
  it('delivers the chosen feedback, dated, for everyone who can see the batch', async () => {
    const { pm, mentor, first, path, recordAs, list, listConversations } = await withFeedback();

    const response = await recordAs(pm, { feedbackId: first.id, heldOn: '2026-10-22', notes });
    const recorded = await conversationOf(response, 201);

    expect(response.headers.get('location')).toBe(`${path}/${recorded.id}`);
    expect(recorded).toMatchObject({
      recordedBy: { id: pm.user.id, name: 'Pat Manager' },
      heldOn: '2026-10-22',
      notes,
      editedAt: null,
      feedback: {
        id: first.id,
        author: { name: 'Mo Mentor' },
        submittedAt: '2026-10-12T09:00:00.000Z',
      },
    });
    const delivered = (await list(mentor)).find(({ id }) => id === first.id);
    expect(delivered).toMatchObject({
      state: 'delivered',
      conversationId: recorded.id,
      deliveredOn: '2026-10-22',
    });
    expect((await list(mentor)).find(({ id }) => id !== first.id)?.deliveredOn).toBeNull();
    expect((await listConversations(mentor)).map(({ id }) => id)).toEqual([recorded.id]);
  });

  it("is the batch's PM's alone", async () => {
    const { setup, admin, mentor, mentoringAdmin, outsider, first, recordAs } =
      await withFeedback();
    const body = { feedbackId: first.id, heldOn: '2026-10-22', notes };

    const statuses = await Promise.all(
      [mentor, mentoringAdmin, admin, outsider, { cookie: '' }].map(
        async (who) => (await recordAs(who, body)).status,
      ),
    );

    expect(statuses).toEqual([403, 403, 403, 404, 401]);
    expect(await db().select().from(conversationTable)).toEqual([]);
    expect(setup).toBeDefined();
  });

  it('delivers each feedback once, even when recorded twice at the same moment', async () => {
    const { pm, first, recordAs } = await withFeedback();
    const body = { feedbackId: first.id, heldOn: '2026-10-22', notes };

    const responses = await Promise.all([recordAs(pm, body), recordAs(pm, body)]);

    expect(responses.map(({ status }) => status).toSorted((a, b) => a - b)).toEqual([201, 409]);
    const refused = responses.find(({ status }) => status === 409);
    expect(ProblemDetails.parse(await refused?.json())).toMatchObject({
      code: 'feedback_delivered',
      detail: 'This feedback has already been delivered.',
    });
    expect(await db().select().from(conversationTable)).toHaveLength(1);
  });

  it("refuses a draft, someone else's draft and unknown feedback", async () => {
    const { pm, mentor, create, recordAs } = await withFeedback();
    const own = await viewOf(await create(pm), 201);
    const theirs = await viewOf(await create(mentor), 201);

    expect(
      (
        await problemOf(
          await recordAs(pm, { feedbackId: own.id, heldOn: '2026-10-22', notes }),
          409,
        )
      ).detail,
    ).toBe("A draft can't be delivered.");
    expect(
      (await recordAs(pm, { feedbackId: theirs.id, heldOn: '2026-10-22', notes })).status,
    ).toBe(404);
    expect(
      (
        await recordAs(pm, {
          feedbackId: '01890a5d-ac96-774b-bcce-b302099a8057',
          heldOn: '2026-10-22',
          notes,
        })
      ).status,
    ).toBe(404);
  });

  it('checks the date, the notes and the choice of feedback', async () => {
    const { pm, first, recordAs } = await withFeedback();

    const early = await problemOf(
      await recordAs(pm, { feedbackId: first.id, heldOn: '2026-10-11', notes }),
      400,
    );
    const blank = await problemOf(
      await recordAs(pm, { feedbackId: 'x', heldOn: '2026-10-25', notes: ' ' }),
      400,
    );

    expect(early.errors).toEqual([
      { path: 'heldOn', message: 'Choose a date from 12 Oct 2026 to today.' },
    ]);
    expect(blank.errors?.map(({ path }) => path)).toEqual(['notes', 'feedbackId']);
  });

  it('refuses an archived batch', async () => {
    const { setup, admin, pm, batch, first, recordAs } = await withFeedback();
    await send(setup, 'POST', admin, `/batches/${batch.id}/archive`, {});

    expect(
      (
        await problemOf(
          await recordAs(pm, { feedbackId: first.id, heldOn: '2026-10-22', notes }),
          409,
        )
      ).code,
    ).toBe('batch_archived');
  });
});

describe('editing a conversation', () => {
  it('changes the notes and date, marking it edited only when something changed', async () => {
    const { setup, pm, first, path, recordAs, list } = await withFeedback();
    const recorded = await conversationOf(
      await recordAs(pm, { feedbackId: first.id, heldOn: '2026-10-22', notes }),
      201,
    );
    const editPath = `${path}/${recorded.id}`;

    const same = await conversationOf(
      await send(setup, 'PATCH', pm, editPath, { heldOn: '2026-10-22', notes }),
      200,
    );
    expect(same.editedAt).toBeNull();
    setup.travel(60_000);
    const edited = await conversationOf(
      await send(setup, 'PATCH', pm, editPath, {
        heldOn: '2026-10-21',
        notes: 'Rescheduled to Wednesday.',
      }),
      200,
    );

    expect(edited).toMatchObject({
      heldOn: '2026-10-21',
      notes: 'Rescheduled to Wednesday.',
      editedAt: '2026-10-24T09:01:00.000Z',
      feedback: { id: first.id },
    });
    expect((await list(pm)).find(({ id }) => id === first.id)?.deliveredOn).toBe('2026-10-21');
  });

  it("is for the batch's PM, and a 404 for another intern's conversation", async () => {
    const { setup, pm, mentor, batch, first, path, recordAs, internOf } = await withFeedback();
    const recorded = await conversationOf(
      await recordAs(pm, { feedbackId: first.id, heldOn: '2026-10-22', notes }),
      201,
    );
    const other = await internOf(batch.id, 'zoya.ansari');

    expect(
      (
        await send(setup, 'PATCH', mentor, `${path}/${recorded.id}`, {
          heldOn: '2026-10-22',
          notes: 'Mine.',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send(
          setup,
          'PATCH',
          pm,
          `/batches/${batch.id}/interns/${other.id}/conversations/${recorded.id}`,
          {
            heldOn: '2026-10-22',
            notes,
          },
        )
      ).status,
    ).toBe(404);
  });
});

describe('a change of programme manager', () => {
  it('lets the new PM edit, and not the one who recorded it', async () => {
    const { setup, admin, pm, batch, first, path, recordAs } = await withFeedback();
    const recorded = await conversationOf(
      await recordAs(pm, { feedbackId: first.id, heldOn: '2026-10-22', notes }),
      201,
    );
    const next = await setup.signedInUser({ name: 'Nia Next', roles: ['program_manager'] });
    expect(
      (
        await send(setup, 'PUT', admin, `/batches/${batch.id}/program-manager`, {
          userId: next.user.id,
        })
      ).status,
    ).toBe(200);
    const editPath = `${path}/${recorded.id}`;
    const change = { heldOn: '2026-10-22', notes: 'Added after the handover.' };

    expect((await send(setup, 'PATCH', pm, editPath, change)).status).toBe(404);
    const edited = await conversationOf(await send(setup, 'PATCH', next, editPath, change), 200);
    expect(edited).toMatchObject({ notes: change.notes, recordedBy: { id: pm.user.id } });
  });
});

describe('the conversation list', () => {
  it('is newest held first', async () => {
    const { pm, first, second, recordAs, listConversations, mentor } = await withFeedback();
    const older = await conversationOf(
      await recordAs(pm, { feedbackId: first.id, heldOn: '2026-10-21', notes }),
      201,
    );
    const newer = await conversationOf(
      await recordAs(pm, { feedbackId: second.id, heldOn: '2026-10-24', notes }),
      201,
    );

    expect((await listConversations(mentor)).map(({ id }) => id)).toEqual([newer.id, older.id]);
  });
});
