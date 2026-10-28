import {
  BatchDetail,
  CommentView,
  ConversationView,
  FeedbackView,
  InternSummary,
  ProblemDetails,
  type Role,
} from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { realApp } from '../../../../test/app-deps.ts';
import { useTestDb } from '../../../../test/test-db.ts';
import { newUserId } from '../../identity/domain/user-id.ts';
import { giveNotice, terminate } from '../../intern/domain/intern.ts';
import { InternId } from '../../intern/domain/intern-id.ts';
import { newStatusEventId } from '../../intern/domain/status-event-id.ts';
import { createInternRepository } from '../../intern/infrastructure/drizzle-intern-repository.ts';
import { comments as commentTable } from '../infrastructure/schema.ts';

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

const commentOf = async (response: Response, status: number) => {
  expect(response.status).toBe(status);
  return CommentView.parse(await response.json());
};

const october = {
  period: '2026-10-01',
  body: 'Closed `PAY-214` with tests first.',
  colorCode: 'orange',
  givesNotice: false,
};

const today = new Date('2026-10-24T09:00:00Z');
const later = (hours: number) => new Date(today.getTime() + hours * 3_600_000);

/**
 * The full app at 24 October 2026 (UTC) with an unassigned admin, the batch's PM, two mentors, an
 * admin assigned as a mentor, and a mentor of no batch; two interns, Ishita and Kabir. Ishita has
 * Mo's submitted feedback, delivered in the PM's conversation, Meg's submitted feedback, and a
 * draft each from Mo and Meg.
 */
const setUp = async () => {
  const setup = realApp(db());
  setup.setTime(today);
  const person = (name: string, roles: [Role, ...Role[]]) => setup.signedInUser({ name, roles });
  const admin = await person('Ada Admin', ['admin']);
  const pm = await person('Pat Manager', ['program_manager']);
  const mentor = await person('Mo Mentor', ['mentor']);
  const mentor2 = await person('Meg Mentor', ['mentor']);
  const mentoringAdmin = await person('Avi Admin', ['admin', 'mentor']);
  const outsider = await person('Oz Outsider', ['mentor']);
  const batch = BatchDetail.parse(
    await (
      await send(setup, 'POST', admin, '/batches', {
        name: 'Batch 2026',
        startDate: '2026-07-06',
        endDate: '2027-12-18',
        programManagerId: pm.user.id,
      })
    ).json(),
  );
  await Promise.all(
    [mentor, mentor2, mentoringAdmin].map(async (member) =>
      send(setup, 'POST', admin, `/batches/${batch.id}/mentors`, { userId: member.user.id }),
    ),
  );
  const internOf = async (username: string, name: string) =>
    InternSummary.parse(
      await (
        await send(setup, 'POST', pm, `/batches/${batch.id}/interns`, {
          username,
          name,
          email: `${username}@example.com`,
        })
      ).json(),
    );
  const intern = await internOf('ishita.rao', 'Ishita Rao');
  const other = await internOf('kabir.das', 'Kabir Das');
  const internPath = (id: string) => `/batches/${batch.id}/interns/${id}`;
  const base = internPath(intern.id);
  const feedbackOf = async (who: Who, body: unknown, internId = intern.id) => {
    const response = await send(setup, 'POST', who, `${internPath(internId)}/feedback`, body);
    expect(response.status).toBe(201);
    return FeedbackView.parse(await response.json());
  };
  const delivered = await feedbackOf(mentor, { ...october, submit: true });
  const submitted = await feedbackOf(mentor2, { ...october, colorCode: null, submit: true });
  const myDraft = await feedbackOf(mentor, october);
  const theirDraft = await feedbackOf(mentor2, october);
  const othersFeedback = await feedbackOf(mentor, { ...october, submit: true }, other.id);
  const recorded = await send(setup, 'POST', pm, `${base}/conversations`, {
    feedbackId: delivered.id,
    heldOn: '2026-10-24',
    notes: 'Delivered in the weekly 1:1.',
  });
  expect(recorded.status).toBe(201);
  const conversation = ConversationView.parse(await recorded.json());

  const onFeedback = (id: string) => `${base}/feedback/${id}/comments`;
  const onConversation = (id: string) => `${base}/conversations/${id}/comments`;
  const commentPath = (id: string) => `${base}/comments/${id}`;
  const comment = async (who: Who, path = onFeedback(submitted.id), body = 'Agree.') =>
    commentOf(await send(setup, 'POST', who, path, { body }), 201);
  const list = async (who: Who) => {
    const response = await send(setup, 'GET', who, `${base}/comments`);
    expect(response.status).toBe(200);
    return z.array(CommentView).parse(await response.json());
  };
  const terminateIntern = async () => {
    const repository = createInternRepository(db());
    const found = await repository.findById(InternId.parse(intern.id));
    if (!found) throw new Error('intern missing');
    const change = { reason: 'Notice period ended.', actor: pm.user.id, now: new Date() };
    await repository.save(
      terminate(
        giveNotice(found, {
          ...change,
          eventId: newStatusEventId(),
          startsOn: '2026-09-01',
          feedbackId: null,
        }),
        { ...change, eventId: newStatusEventId() },
      ),
    );
  };
  return {
    setup,
    admin,
    pm,
    mentor,
    mentor2,
    mentoringAdmin,
    outsider,
    batch,
    other,
    internPath,
    delivered,
    submitted,
    myDraft,
    theirDraft,
    othersFeedback,
    conversation,
    onFeedback,
    onConversation,
    commentPath,
    comment,
    list,
    terminateIntern,
  };
};

const storedCount = async () => (await db().select().from(commentTable)).length;

describe('adding a comment', () => {
  it('goes on submitted and delivered feedback and on a conversation, listed oldest first', async () => {
    const context = await setUp();
    const { setup, mentor, mentor2, pm, delivered, submitted, conversation } = context;
    const response = await send(setup, 'POST', mentor, context.onFeedback(submitted.id), {
      body: ' Agree.\nShe also helped two others. ',
    });
    const first = await commentOf(response, 201);
    expect(response.headers.get('location')).toBe(context.commentPath(first.id));
    expect(first).toMatchObject({
      parent: { kind: 'feedback', id: submitted.id },
      author: { id: mentor.user.id, name: 'Mo Mentor', avatarUrl: null },
      body: ' Agree.\nShe also helped two others. ',
      createdAt: today.toISOString(),
      editedAt: null,
      deletedAt: null,
    });
    setup.setTime(later(1));
    const second = await context.comment(pm, context.onConversation(conversation.id), 'Noted.');
    setup.setTime(later(2));
    const third = await context.comment(mentor2, context.onFeedback(delivered.id), 'Reviewed.');

    expect(second.parent).toEqual({ kind: 'conversation', id: conversation.id });
    const listed = await context.list(context.admin);
    expect(listed).toEqual([first, second, third]);
  });

  it("is for the batch's mentors and PM, admins only when assigned", async () => {
    const { setup, admin, pm, mentor, mentoringAdmin, outsider, submitted, onFeedback } =
      await setUp();
    const statuses = await Promise.all(
      [mentor, pm, mentoringAdmin, admin, outsider, { cookie: '' }].map(
        async (who) =>
          (await send(setup, 'POST', who, onFeedback(submitted.id), { body: 'Agree.' })).status,
      ),
    );

    expect(statuses).toEqual([201, 201, 201, 403, 404, 401]);
    expect(await storedCount()).toBe(3);
  });

  it('refuses drafts, and hides parents the actor can’t see or that are elsewhere', async () => {
    const context = await setUp();
    const { setup, mentor, myDraft, theirDraft, othersFeedback, onFeedback, onConversation } =
      context;
    const post = (path: string) => send(setup, 'POST', mentor, path, { body: 'Agree.' });

    expect(await problemOf(await post(onFeedback(myDraft.id)), 409)).toMatchObject({
      detail: "Drafts can't be commented on.",
    });
    const missing = await Promise.all(
      [
        onFeedback(theirDraft.id),
        onFeedback(newUserId()),
        onFeedback(othersFeedback.id),
        onConversation(newUserId()),
        `${context.internPath(context.other.id)}/conversations/${context.conversation.id}/comments`,
      ].map(async (path) => (await post(path)).status),
    );
    expect(missing).toEqual([404, 404, 404, 404, 404]);
    expect(await storedCount()).toBe(0);
  });

  it('needs a body', async () => {
    const { setup, mentor, submitted, onFeedback } = await setUp();
    const problem = await problemOf(
      await send(setup, 'POST', mentor, onFeedback(submitted.id), { body: ' \n' }),
      400,
    );
    expect(problem.errors).toEqual([{ path: 'body', message: 'Write a comment.' }]);
  });
});

describe('editing a comment', () => {
  it('changes the body and marks it edited; an unchanged body isn’t marked', async () => {
    const { setup, mentor, comment, commentPath, list } = await setUp();
    const added = await comment(mentor);
    setup.setTime(later(1));

    const unchanged = await commentOf(
      await send(setup, 'PATCH', mentor, commentPath(added.id), { body: 'Agree.' }),
      200,
    );
    expect(unchanged.editedAt).toBeNull();
    const edited = await commentOf(
      await send(setup, 'PATCH', mentor, commentPath(added.id), { body: 'Agree, well done.' }),
      200,
    );

    expect(edited).toMatchObject({ body: 'Agree, well done.', editedAt: later(1).toISOString() });
    expect(await list(mentor)).toEqual([edited]);
  });

  it('is for its author only', async () => {
    const { setup, admin, pm, mentor, mentor2, comment, commentPath } = await setUp();
    const added = await comment(mentor);

    const statuses = await Promise.all(
      [mentor2, pm, admin].map(
        async (who) =>
          (await send(setup, 'PATCH', who, commentPath(added.id), { body: 'Changed.' })).status,
      ),
    );

    expect(statuses).toEqual([403, 403, 403]);
  });

  it('is refused once its author leaves the batch', async () => {
    const { setup, admin, mentor, mentoringAdmin, batch, comment, commentPath } = await setUp();
    const mine = await comment(mentor);
    const theirs = await comment(mentoringAdmin);
    await Promise.all(
      [mentor, mentoringAdmin].map(async (who) =>
        send(setup, 'DELETE', admin, `/batches/${batch.id}/mentors/${who.user.id}`),
      ),
    );
    const patch = (who: Who, id: string) =>
      send(setup, 'PATCH', who, commentPath(id), { body: 'Changed.' });

    // The mentor no longer sees the batch; the admin still does, but only reads it.
    expect((await patch(mentor, mine.id)).status).toBe(404);
    expect((await patch(mentoringAdmin, theirs.id)).status).toBe(403);
    expect((await send(setup, 'DELETE', mentor, commentPath(mine.id))).status).toBe(404);
  });

  it("is a 404 for an unknown comment or another intern's path", async () => {
    const { setup, mentor, comment, commentPath, internPath, other } = await setUp();
    const added = await comment(mentor);
    const body = { body: 'Changed.' };

    expect((await send(setup, 'PATCH', mentor, commentPath(newUserId()), body)).status).toBe(404);
    const elsewhere = `${internPath(other.id)}/comments/${added.id}`;
    expect((await send(setup, 'PATCH', mentor, elsewhere, body)).status).toBe(404);
    expect((await send(setup, 'DELETE', mentor, elsewhere)).status).toBe(404);
  });
});

describe('deleting a comment', () => {
  it('clears the body and keeps it listed; again changes nothing; an edit after is refused', async () => {
    const { setup, mentor, mentor2, comment, commentPath, list } = await setUp();
    const added = await comment(mentor);
    setup.setTime(later(1));

    expect((await send(setup, 'DELETE', mentor2, commentPath(added.id))).status).toBe(403);
    expect((await send(setup, 'DELETE', mentor, commentPath(added.id))).status).toBe(204);
    const deleted = { ...added, body: '', deletedAt: later(1).toISOString() };
    expect(await list(mentor2)).toEqual([deleted]);

    setup.setTime(later(2));
    expect((await send(setup, 'DELETE', mentor, commentPath(added.id))).status).toBe(204);
    expect(await list(mentor2)).toEqual([deleted]);
    const problem = await problemOf(
      await send(setup, 'PATCH', mentor, commentPath(added.id), { body: 'Back.' }),
      409,
    );
    expect(problem).toMatchObject({ code: 'comment_deleted', detail: 'This comment was deleted.' });
  });

  it('wins over an edit at the same time, which waits and then finds it deleted', async () => {
    const { setup, mentor, comment, commentPath, list } = await setUp();
    const added = await comment(mentor);

    const responses = await Promise.all([
      send(setup, 'PATCH', mentor, commentPath(added.id), { body: 'Changed.' }),
      send(setup, 'DELETE', mentor, commentPath(added.id)),
    ]);

    // Either the edit went first (200, 204) or the delete did (409, 204); never a 500.
    expect([
      [200, 204],
      [409, 204],
    ]).toContainEqual(responses.map(({ status }) => status));
    expect(await list(mentor)).toMatchObject([{ id: added.id, body: '' }]);
  });
});

describe('a record that can’t change', () => {
  it('refuses adding, editing and deleting in an archived batch', async () => {
    const { setup, admin, mentor, batch, submitted, onFeedback, comment, commentPath } =
      await setUp();
    const added = await comment(mentor);
    await send(setup, 'POST', admin, `/batches/${batch.id}/archive`, {});

    const codes = await Promise.all(
      [
        send(setup, 'POST', mentor, onFeedback(submitted.id), { body: 'Agree.' }),
        send(setup, 'PATCH', mentor, commentPath(added.id), { body: 'Changed.' }),
        send(setup, 'DELETE', mentor, commentPath(added.id)),
      ].map(async (response) => (await problemOf(await response, 409)).code),
    );

    expect(codes).toEqual(['batch_archived', 'batch_archived', 'batch_archived']);
  });

  it("refuses adding, editing and deleting on a read-only intern's record", async () => {
    const context = await setUp();
    const { setup, mentor, pm, conversation, onConversation, comment, commentPath } = context;
    const added = await comment(mentor);
    await context.terminateIntern();

    const codes = await Promise.all(
      [
        send(setup, 'POST', pm, onConversation(conversation.id), { body: 'Noted.' }),
        send(setup, 'PATCH', mentor, commentPath(added.id), { body: 'Changed.' }),
        send(setup, 'DELETE', mentor, commentPath(added.id)),
      ].map(async (response) => (await problemOf(await response, 409)).code),
    );

    expect(codes).toEqual(['intern_read_only', 'intern_read_only', 'intern_read_only']);
    expect(await context.list(mentor)).toEqual([added]);
  });
});
