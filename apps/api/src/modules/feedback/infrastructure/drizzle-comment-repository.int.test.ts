import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import type { DbExecutor } from '../../../shared/db/client.ts';
import { pgErrorOf } from '../../../shared/db/pg-error.ts';
import { createBatch } from '../../cohort/domain/batch.ts';
import { newBatchId } from '../../cohort/domain/batch-id.ts';
import { newBatchMemberId } from '../../cohort/domain/batch-member-id.ts';
import { createBatchRepository } from '../../cohort/infrastructure/drizzle-batch-repository.ts';
import { createUser } from '../../identity/domain/user.ts';
import { newUserId, type UserId } from '../../identity/domain/user-id.ts';
import { createUserRepository } from '../../identity/infrastructure/drizzle-user-repository.ts';
import { type Intern, onboardIntern } from '../../intern/domain/intern.ts';
import { newInternId } from '../../intern/domain/intern-id.ts';
import { newStatusEventId } from '../../intern/domain/status-event-id.ts';
import { createInternRepository } from '../../intern/infrastructure/drizzle-intern-repository.ts';
import { addComment, deleteComment, editComment, type ParentEntry } from '../domain/comment.ts';
import { newCommentId } from '../domain/comment-id.ts';
import { recordConversation } from '../domain/conversation.ts';
import { newConversationId } from '../domain/conversation-id.ts';
import { draftFeedback, submitFeedback } from '../domain/feedback.ts';
import { newFeedbackId } from '../domain/feedback-id.ts';
import { createCommentRepository } from './drizzle-comment-repository.ts';
import { createConversationRepository } from './drizzle-conversation-repository.ts';
import { createFeedbackRepository } from './drizzle-feedback-repository.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;
const repo = () => createCommentRepository(db());

const t0 = new Date('2026-07-06T09:00:00.000Z');
const t1 = new Date('2026-10-24T09:00:00.000Z');
const t2 = new Date('2026-10-25T09:00:00.000Z');
const range = { batchStartsOn: '2026-07-06', today: '2026-10-24' };
const member = { isMember: true, isArchived: false };

const savedUser = async (roles: ['program_manager'] | ['mentor']): Promise<UserId> => {
  const id = newUserId();
  await createUserRepository(db()).save(
    createUser({
      id,
      email: `user.${id.slice(-6)}@example.com`,
      name: 'Pat Person',
      roles,
      grantedBy: null,
      now: t0,
    }),
  );
  return id;
};

/** An intern with submitted feedback and a conversation delivering other feedback. */
const savedParents = async () => {
  const pm = await savedUser(['program_manager']);
  const author = await savedUser(['mentor']);
  const batch = createBatch({
    id: newBatchId(),
    name: 'Batch 2026',
    startDate: '2026-07-06',
    endDate: '2027-12-18',
    programManager: { id: pm, roles: ['program_manager'], isActive: true },
    memberId: newBatchMemberId(),
    createdBy: pm,
    now: t0,
  });
  await createBatchRepository(db()).save(batch);
  const intern: Intern = onboardIntern({
    id: newInternId(),
    eventId: newStatusEventId(),
    batchId: batch.id,
    details: { username: 'ishita.rao', name: 'Ishita Rao', email: 'ishita@example.com' },
    actor: pm,
    now: t0,
  });
  await createInternRepository(db()).save(intern);
  const submitted = () =>
    submitFeedback(
      draftFeedback({
        id: newFeedbackId(),
        intern,
        author,
        content: { period: '2026-10-01', body: 'Closed `PAY-214`.', colorCode: null },
        range,
        now: t1,
      }),
      { intern, actor: author, range, eventId: newStatusEventId(), now: t1 },
    ).feedback;
  const feedback = submitted();
  const recorded = recordConversation({
    id: newConversationId(),
    feedback: submitted(),
    intern,
    actor: pm,
    batch: { isProgramManager: true, isArchived: false },
    content: { heldOn: '2026-10-24', notes: 'Delivered in the weekly 1:1.' },
    now: t1,
  });
  const feedbackRepo = createFeedbackRepository(db());
  await feedbackRepo.save(feedback);
  await createConversationRepository(db()).save(recorded.conversation);
  await feedbackRepo.save(recorded.feedback);
  const commentOn = (on: ParentEntry) =>
    addComment({
      id: newCommentId(),
      on,
      intern,
      actor: author,
      batch: member,
      body: 'Agree.',
      now: t1,
    });
  return { intern, author, feedback, conversation: recorded.conversation, commentOn };
};

/** Locks on another connection, which gives up quickly instead of waiting: "locked" or the code. */
const tryLocking = (lock: (other: DbExecutor) => unknown) =>
  db()
    .transaction(async (other) => {
      await other.execute(sql`set local lock_timeout = '200ms'`);
      await lock(other);
      return 'locked';
    })
    .catch((error: unknown) => pgErrorOf(error)?.code ?? 'unexpected');

describe('the comment repository', () => {
  it('saves comments on feedback and on a conversation and loads them with their intern', async () => {
    const { intern, feedback, conversation, commentOn } = await savedParents();
    const onFeedback = commentOn({ kind: 'feedback', feedback });
    const onConversation = commentOn({ kind: 'conversation', conversation });

    await repo().save(onFeedback);
    await repo().save(onConversation);

    expect(await repo().findByIdForUpdate(onFeedback.id)).toEqual({
      comment: onFeedback,
      internId: intern.id,
    });
    expect(await repo().findByIdForUpdate(onConversation.id)).toEqual({
      comment: onConversation,
      internId: intern.id,
    });
    expect(await repo().findByIdForUpdate(newCommentId())).toBeNull();
  });

  it('saves an edit and a delete', async () => {
    const { intern, author, feedback, commentOn } = await savedParents();
    const comment = commentOn({ kind: 'feedback', feedback });
    await repo().save(comment);
    const context = { intern, actor: author, batch: member };

    const edited = editComment(comment, { ...context, body: 'Agree, well done.', now: t1 });
    await repo().save(edited);
    expect((await repo().findByIdForUpdate(comment.id))?.comment).toEqual(edited);

    const deleted = deleteComment(edited, { ...context, now: t2 });
    await repo().save(deleted);
    expect((await repo().findByIdForUpdate(comment.id))?.comment).toEqual(deleted);
  });

  it('holds the comment until the transaction ends, and not its parent', async () => {
    const { feedback, commentOn } = await savedParents();
    const comment = commentOn({ kind: 'feedback', feedback });
    await repo().save(comment);

    const outcome = await db().transaction(async (tx) => {
      await createCommentRepository(tx).findByIdForUpdate(comment.id);
      return {
        comment: await tryLocking((other) =>
          createCommentRepository(other).findByIdForUpdate(comment.id),
        ),
        parent: await tryLocking((other) =>
          createFeedbackRepository(other).findByIdForUpdate(feedback.id),
        ),
      };
    });

    expect(outcome).toEqual({ comment: '55P03', parent: 'locked' });
  });
});
