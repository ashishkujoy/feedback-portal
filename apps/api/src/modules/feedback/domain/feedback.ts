import { ColorCode, type FeedbackState } from '@feedback-portal/contracts';
import { z } from 'zod';
import { conflict, forbidden, validationFailed } from '../../../shared/errors/app-error.ts';
import { fieldIssues } from '../../../shared/errors/field-issues.ts';
import type { UserId } from '../../identity/domain/user-id.ts';
import {
  currentNotice,
  ensureEditable,
  giveNotice,
  type Intern,
  liftNotice,
  setColorCode,
} from '../../intern/domain/intern.ts';
import type { InternId } from '../../intern/domain/intern-id.ts';
import type { StatusEventId } from '../../intern/domain/status-event-id.ts';
import type { ConversationId } from './conversation-id.ts';
import type { FeedbackId } from './feedback-id.ts';

/**
 * One mentor's feedback on one intern for one month: a draft only its author sees, then
 * submitted (visible to the batch, and setting the intern's colour code and notice; its author
 * can still change it, 9.8), then delivered in a conversation, after which it never changes.
 */
export type Feedback = Readonly<{
  id: FeedbackId;
  internId: InternId;
  authorId: UserId;
  /** `YYYY-MM-01`: the month covered. */
  period: string;
  /** Markdown; may be blank while a draft. */
  body: string;
  /** `null` leaves the intern's code unchanged. */
  colorCode: ColorCode | null;
  givesNotice: boolean;
  state: FeedbackState;
  /** The conversation that delivered it. */
  conversationId: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** When its author last changed it after submitting (9.8); delivery moves only `updatedAt`. */
  editedAt: Date | null;
}>;

/** What the author writes; the same fields for a new draft and an edit. */
export type ContentInput = Readonly<{
  period: string;
  body: string;
  colorCode?: ColorCode | null;
  givesNotice?: boolean;
}>;

/**
 * The months feedback can cover (9.2 decision 4): from the batch's start month to the current
 * one. Both are `YYYY-MM-DD` calendar dates from the caller.
 */
export type MonthRange = Readonly<{ batchStartsOn: string; today: string }>;

const bodyMax = 20_000;

const Content = z.object({
  period: z
    .string({ error: 'Choose the month this feedback covers.' })
    .regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, { error: 'Choose the month this feedback covers.' }),
  body: z.string().max(bodyMax, { error: `Feedback must be at most ${bodyMax} characters` }),
  colorCode: ColorCode.nullish().transform((value) => value ?? null),
  givesNotice: z
    .boolean()
    .optional()
    .transform((value) => value ?? false),
});

type Content = z.output<typeof Content>;

const firstOfMonth = (isoDate: string): string => `${isoDate.slice(0, 7)}-01`;

/** "October 2026", whatever the server's locale and time zone. */
export const monthLabel = (period: string): string =>
  new Date(`${period}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

const parseContent = (input: ContentInput, range: MonthRange): Content => {
  const result = Content.safeParse(input);
  if (!result.success) throw validationFailed(fieldIssues(result.error));
  const earliest = firstOfMonth(range.batchStartsOn);
  const latest = firstOfMonth(range.today);
  // `YYYY-MM-01` strings sort as the months they name.
  if (result.data.period < earliest || result.data.period > latest) {
    throw validationFailed([
      {
        path: 'period',
        message: `Choose a month from ${monthLabel(earliest)} to ${monthLabel(latest)}.`,
      },
    ]);
  }
  return result.data;
};

const ensureAuthor = (feedback: Feedback, actor: UserId): void => {
  if (feedback.authorId !== actor) throw forbidden('Only its author can change this feedback');
};

const ensureNotDelivered = (feedback: Feedback): void => {
  if (feedback.state === 'delivered') {
    throw conflict("Delivered feedback can't be changed.", 'feedback_delivered');
  }
};

const ensureDraft = (feedback: Feedback): void => {
  ensureNotDelivered(feedback);
  if (feedback.state !== 'draft') {
    throw conflict('This feedback has already been submitted.', 'feedback_not_draft');
  }
};

const ensureSameIntern = (feedback: Feedback, intern: Intern): void => {
  // A caller bug, not something a person can do: the use case loads the feedback's own intern.
  if (feedback.internId !== intern.id) throw new Error('Feedback and intern do not match');
};

/** Notice is only for an Active intern (9.2 decision 2), as v2 disables the switch otherwise. */
const ensureCanGiveNotice = (intern: Intern): void => {
  ensureEditable(intern);
  if (intern.status !== 'active') {
    throw conflict('This intern is already on notice.', 'intern_not_active');
  }
};

const ensureWritten = (body: string): void => {
  if (!/\S/.test(body)) {
    throw validationFailed([{ path: 'body', message: 'Write your feedback before submitting.' }]);
  }
};

export type DraftInput = Readonly<{
  id: FeedbackId;
  intern: Intern;
  author: UserId;
  content: ContentInput;
  range: MonthRange;
  now: Date;
}>;

/** A new draft. Its body may still be blank; notice is checked now and again on submit. */
export const draftFeedback = ({
  id,
  intern,
  author,
  content,
  range,
  now,
}: DraftInput): Feedback => {
  ensureEditable(intern);
  const parsed = parseContent(content, range);
  if (parsed.givesNotice) ensureCanGiveNotice(intern);
  return {
    id,
    internId: intern.id,
    authorId: author,
    ...parsed,
    state: 'draft',
    conversationId: null,
    submittedAt: null,
    createdAt: now,
    updatedAt: now,
    editedAt: null,
  };
};

type ChangeContext = Readonly<{ intern: Intern; actor: UserId; now: Date }>;

/** Replaces a draft's month, text, colour and notice. Its author only. */
export const editDraft = (
  feedback: Feedback,
  {
    intern,
    actor,
    content,
    range,
    now,
  }: ChangeContext & { content: ContentInput; range: MonthRange },
): Feedback => {
  ensureDraft(feedback);
  ensureAuthor(feedback, actor);
  ensureSameIntern(feedback, intern);
  ensureEditable(intern);
  const parsed = parseContent(content, range);
  if (parsed.givesNotice) ensureCanGiveNotice(intern);
  return { ...feedback, ...parsed, updatedAt: now };
};

/**
 * Checks a draft can be discarded (its author, still a draft); the repository then deletes it.
 * Allowed for a read-only intern too, so nothing is left stuck.
 */
export const discardDraft = (feedback: Feedback, actor: UserId): FeedbackId => {
  ensureDraft(feedback);
  ensureAuthor(feedback, actor);
  return feedback.id;
};

export type SubmitInput = ChangeContext &
  Readonly<{
    range: MonthRange;
    /** The status event's id, used when the feedback gives notice. */
    eventId: StatusEventId;
  }>;

/**
 * Submits a draft. Setting a colour snapshots the intern's code and replaces it (no colour
 * leaves both alone); giving notice puts the intern on notice for one month from `range.today`,
 * with an event pointing here. The caller saves both in one transaction.
 */
export const submitFeedback = (
  feedback: Feedback,
  { intern, actor, range, eventId, now }: SubmitInput,
): Readonly<{ feedback: Feedback; intern: Intern }> => {
  ensureDraft(feedback);
  ensureAuthor(feedback, actor);
  ensureSameIntern(feedback, intern);
  ensureEditable(intern);
  ensureWritten(feedback.body);
  const content = parseContent(feedback, range);
  if (content.givesNotice) ensureCanGiveNotice(intern);

  const coloured = content.colorCode
    ? setColorCode(intern, { colorCode: content.colorCode, now })
    : intern;
  const updated = content.givesNotice
    ? giveNotice(coloured, {
        eventId,
        reason: `Notice given in the ${monthLabel(content.period)} feedback.`,
        actor,
        now,
        startsOn: range.today,
        feedbackId: feedback.id,
      })
    : coloured;
  return {
    feedback: {
      ...feedback,
      state: 'submitted',
      submittedAt: now,
      updatedAt: now,
    },
    intern: updated,
  };
};

/** Withdrawing notice is only for the notice this feedback gave, while it's still running. */
const ensureOwnNoticeRunning = (feedback: Feedback, intern: Intern): void => {
  if (currentNotice(intern)?.feedbackId !== feedback.id) {
    throw conflict(
      "This feedback's notice is no longer running, so it can't be withdrawn here.",
      'notice_not_running',
    );
  }
};

export type EditSubmittedInput = ChangeContext &
  Readonly<{
    content: ContentInput;
    range: MonthRange;
    /** The status event's id, used when the edit gives or withdraws notice. */
    eventId: StatusEventId;
  }>;

/**
 * The author's change to submitted feedback until it's delivered (9.8): month, text, colour and
 * notice, by the same rules as submitting. Switching notice on starts one from `range.today`;
 * switching it off withdraws the notice this feedback gave, back to Active. Both are recorded in
 * the status history. The intern's colour is left to the caller, which recalculates it from the
 * newest coloured feedback once this one is saved. Nothing changed, nothing is marked edited.
 */
export const editSubmitted = (
  feedback: Feedback,
  { intern, actor, content, range, eventId, now }: EditSubmittedInput,
): Readonly<{ feedback: Feedback; intern: Intern }> => {
  ensureNotDelivered(feedback);
  if (feedback.state !== 'submitted') throw conflict('This feedback is still a draft.');
  ensureAuthor(feedback, actor);
  ensureSameIntern(feedback, intern);
  ensureEditable(intern);
  const parsed = parseContent(content, range);
  ensureWritten(parsed.body);
  const unchanged =
    parsed.period === feedback.period &&
    parsed.body === feedback.body &&
    parsed.colorCode === feedback.colorCode &&
    parsed.givesNotice === feedback.givesNotice;
  if (unchanged) return { feedback, intern };

  const month = monthLabel(parsed.period);
  let updated = intern;
  if (parsed.givesNotice && !feedback.givesNotice) {
    ensureCanGiveNotice(intern);
    updated = giveNotice(intern, {
      eventId,
      reason: `Notice given by editing the ${month} feedback.`,
      actor,
      now,
      startsOn: range.today,
      feedbackId: feedback.id,
    });
  } else if (!parsed.givesNotice && feedback.givesNotice) {
    ensureOwnNoticeRunning(feedback, intern);
    updated = liftNotice(intern, {
      eventId,
      reason: `Notice withdrawn by editing the ${month} feedback.`,
      actor,
      now,
    });
  }
  return {
    feedback: { ...feedback, ...parsed, updatedAt: now, editedAt: now },
    intern: updated,
  };
};

/** Delivered in a conversation (10.2); from then on it never changes. */
export const deliverFeedback = (
  feedback: Feedback,
  { conversationId, now }: Readonly<{ conversationId: ConversationId; now: Date }>,
): Feedback => {
  ensureNotDelivered(feedback);
  if (feedback.state !== 'submitted') throw conflict("A draft can't be delivered.");
  return { ...feedback, state: 'delivered', conversationId, updatedAt: now };
};
