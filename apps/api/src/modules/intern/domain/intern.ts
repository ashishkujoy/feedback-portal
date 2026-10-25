import { type ColorCode, type InternStatus, isFinalStatus } from '@feedback-portal/contracts';
import { z } from 'zod';
import { addMonths } from '../../../shared/calendar-date.ts';
import { conflict, validationFailed } from '../../../shared/errors/app-error.ts';
import { fieldIssues } from '../../../shared/errors/field-issues.ts';
import type { BatchId } from '../../cohort/domain/batch-id.ts';
import type { UserId } from '../../identity/domain/user-id.ts';
import type { InternId } from './intern-id.ts';
import type { StatusEventId } from './status-event-id.ts';

/** One status change. Append-only: once recorded, an event never changes. */
export type StatusEvent = Readonly<{
  id: StatusEventId;
  /** `null` only for the onboarding event. */
  fromStatus: InternStatus | null;
  toStatus: InternStatus;
  /** Markdown; `null` only for the onboarding event. */
  reason: string | null;
  noticeStartsOn: string | null;
  noticeEndsOn: string | null;
  /** The feedback that gave notice, if any. */
  feedbackId: string | null;
  actorId: UserId;
  createdAt: Date;
}>;

export type InternDetails = Readonly<{
  username: string;
  name: string;
  email: string;
  phone: string | null;
  diplomaBranch: string | null;
  parentNames: string | null;
  /** Markdown. */
  interviewNotes: string | null;
}>;

export type Intern = InternDetails &
  Readonly<{
    id: InternId;
    batchId: BatchId;
    airtableRecordId: string | null;
    airtableFields: Readonly<Record<string, unknown>> | null;
    photoPublicId: string | null;
    /** Denormalized from `statusEvents`; operations keep them in step. */
    status: InternStatus;
    /** Set by submitted feedback; `null` means no colour code yet. */
    colorCode: ColorCode | null;
    /** `YYYY-MM-DD`, set exactly while on notice. */
    noticeEndsOn: string | null;
    createdAt: Date;
    updatedAt: Date;
    /** Part of the aggregate: the history, oldest first. Never edited, only appended to. */
    statusEvents: readonly StatusEvent[];
  }>;

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} must be at most ${max} characters` })
    .nullish()
    .transform((value) => (value ? value : null));

const Details = z.object({
  username: z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, '').toLowerCase())
    .pipe(
      z
        .string()
        .min(1, { error: 'Username is required', abort: true })
        .max(50, { error: 'Username must be at most 50 characters' })
        .regex(/^[a-z0-9._-]+$/, {
          error: 'Username can only contain letters, digits, ".", "_" and "-"',
        }),
    ),
  name: z
    .string()
    .trim()
    .min(1, { error: 'Name is required' })
    .max(200, { error: 'Name must be at most 200 characters' }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(
      z
        .string()
        .min(1, { error: 'Email is required', abort: true })
        .pipe(
          z
            .email({ error: 'Invalid email address' })
            .max(254, { error: 'Email must be at most 254 characters' }),
        ),
    ),
  phone: optionalText(50, 'Phone'),
  diplomaBranch: optionalText(200, 'Diploma branch'),
  parentNames: optionalText(500, 'Parent names'),
  interviewNotes: optionalText(20_000, 'Interview notes'),
});

/** What callers give for an intern's details; the optional ones may be missing or blank. */
export type DetailsInput = z.input<typeof Details>;

const parseDetails = (input: DetailsInput): InternDetails => {
  const result = Details.safeParse(input);
  if (!result.success) throw validationFailed(fieldIssues(result.error));
  return result.data;
};

const Reason = z
  .string()
  .trim()
  .min(1, { error: 'Add a reason.' })
  .max(20_000, { error: 'Reason must be at most 20000 characters' });

const parseReason = (reason: string): string => {
  const result = Reason.safeParse(reason);
  if (!result.success) throw validationFailed(fieldIssues(result.error, 'reason'));
  return result.data;
};

const parseStartDate = (startsOn: string): string => {
  const result = z.iso.date({ error: 'Notice start must be a valid date' }).safeParse(startsOn);
  if (!result.success) throw validationFailed(fieldIssues(result.error, 'noticeStartsOn'));
  return result.data;
};

/** PRODUCT §10. Graduated, terminated and withdrawn are final: nothing leaves them. */
const allowedChanges: Readonly<Record<InternStatus, readonly InternStatus[]>> = {
  active: ['on_notice', 'graduated', 'withdrawn'],
  on_notice: ['active', 'terminated', 'withdrawn'],
  graduated: [],
  terminated: [],
  withdrawn: [],
};

const statusLabels: Readonly<Record<InternStatus, string>> = {
  active: 'active',
  on_notice: 'on notice',
  graduated: 'graduated',
  terminated: 'terminated',
  withdrawn: 'withdrawn',
};

/** Graduated, terminated and withdrawn interns are read-only (PRODUCT §10). */
export const isReadOnly = (intern: Intern): boolean => isFinalStatus(intern.status);

/** Refuses any change to a graduated, terminated or withdrawn intern. */
export const ensureEditable = (intern: Intern): void => {
  if (isReadOnly(intern)) {
    throw conflict(
      `This intern is ${statusLabels[intern.status]}, so their record is read-only`,
      'intern_read_only',
    );
  }
};

/** A notice runs one calendar month from its start (PRODUCT §10). */
const noticeLengthInMonths = 1;

export type ChangeInput = Readonly<{
  eventId: StatusEventId;
  /** Markdown; required for every change. */
  reason: string;
  actor: UserId;
  now: Date;
}>;

type NoticeInput = Readonly<{ startsOn: string; feedbackId: string | null }>;

/**
 * The one place a status changes: checks the state machine, the reason and (for notice) the
 * dates, appends the event and updates `status` and `noticeEndsOn` together.
 */
const transition = (
  intern: Intern,
  to: InternStatus,
  { eventId, reason, actor, now }: ChangeInput,
  notice?: NoticeInput,
): Intern => {
  ensureEditable(intern);
  if (!allowedChanges[intern.status].includes(to)) {
    throw conflict(
      `An intern who is ${statusLabels[intern.status]} can't become ${statusLabels[to]}`,
      'invalid_status_transition',
    );
  }
  const validReason = parseReason(reason);
  const noticeStartsOn = notice ? parseStartDate(notice.startsOn) : null;
  const noticeEndsOn = noticeStartsOn ? addMonths(noticeStartsOn, noticeLengthInMonths) : null;
  const event: StatusEvent = {
    id: eventId,
    fromStatus: intern.status,
    toStatus: to,
    reason: validReason,
    noticeStartsOn,
    noticeEndsOn,
    feedbackId: notice?.feedbackId ?? null,
    actorId: actor,
    createdAt: now,
  };
  return {
    ...intern,
    status: to,
    noticeEndsOn,
    updatedAt: now,
    statusEvents: [...intern.statusEvents, event],
  };
};

export type OnboardInput = Readonly<{
  id: InternId;
  eventId: StatusEventId;
  batchId: BatchId;
  details: DetailsInput;
  airtableRecordId?: string | null;
  airtableFields?: Readonly<Record<string, unknown>> | null;
  actor: UserId;
  now: Date;
}>;

/**
 * A new intern, Active, with the onboarding event (no previous status, no reason). Every
 * operation returns a new `Intern`, or the same object when nothing changes; time, ids and the
 * actor come from the caller.
 */
export const onboardIntern = ({
  id,
  eventId,
  batchId,
  details,
  airtableRecordId = null,
  airtableFields = null,
  actor,
  now,
}: OnboardInput): Intern => ({
  id,
  batchId,
  ...parseDetails(details),
  airtableRecordId,
  airtableFields,
  photoPublicId: null,
  status: 'active',
  colorCode: null,
  noticeEndsOn: null,
  createdAt: now,
  updatedAt: now,
  statusEvents: [
    {
      id: eventId,
      fromStatus: null,
      toStatus: 'active',
      reason: null,
      noticeStartsOn: null,
      noticeEndsOn: null,
      feedbackId: null,
      actorId: actor,
      createdAt: now,
    },
  ],
});

/** Active → On notice, for one month from `startsOn`; usually from feedback (Phase 9). */
export const giveNotice = (
  intern: Intern,
  { startsOn, feedbackId, ...change }: ChangeInput & NoticeInput,
): Intern => transition(intern, 'on_notice', change, { startsOn, feedbackId });

/** On notice → Active, for example because the intern improved. */
export const liftNotice = (intern: Intern, change: ChangeInput): Intern =>
  transition(intern, 'active', change);

/** On notice → Terminated. Always a manual action; nothing happens when a notice ends. */
export const terminate = (intern: Intern, change: ChangeInput): Intern =>
  transition(intern, 'terminated', change);

/** Active → Graduated. Someone on notice has it lifted first. */
export const graduate = (intern: Intern, change: ChangeInput): Intern =>
  transition(intern, 'graduated', change);

/** Active or On notice → Withdrawn (they left of their own accord). */
export const withdraw = (intern: Intern, change: ChangeInput): Intern =>
  transition(intern, 'withdrawn', change);

/** Replaces the details; rejected once the intern is read-only. */
export const updateDetails = (
  intern: Intern,
  { details, now }: Readonly<{ details: DetailsInput; now: Date }>,
): Intern => {
  ensureEditable(intern);
  return { ...intern, ...parseDetails(details), updatedAt: now };
};

/**
 * The colour code from submitted feedback (Phase 9). There is no way back to `null`: feedback
 * without a colour leaves the code alone.
 */
export const setColorCode = (
  intern: Intern,
  { colorCode, now }: Readonly<{ colorCode: ColorCode; now: Date }>,
): Intern => {
  ensureEditable(intern);
  return { ...intern, colorCode, updatedAt: now };
};

/** The notice that is running, if the intern is on notice. */
export const currentNotice = (intern: Intern): StatusEvent | undefined =>
  intern.status === 'on_notice'
    ? intern.statusEvents.findLast((event) => event.toStatus === 'on_notice')
    : undefined;

/** A new photo (its storage `publicId`); rejected once the intern is read-only. */
export const setPhoto = (
  intern: Intern,
  { publicId, now }: Readonly<{ publicId: string; now: Date }>,
): Intern => {
  ensureEditable(intern);
  return { ...intern, photoPublicId: publicId, updatedAt: now };
};

/**
 * A re-import (8.4): the mapped fields replaced by Airtable's (an empty one cleared), the record
 * id and raw snapshot refreshed. The username stays (it's how they matched); status, colour,
 * photo and history are untouched. Refused once the intern is read-only.
 */
export const refreshFromAirtable = (
  intern: Intern,
  {
    details,
    airtableRecordId,
    airtableFields,
    now,
  }: Readonly<{
    details: DetailsInput;
    airtableRecordId: string;
    airtableFields: Readonly<Record<string, unknown>>;
    now: Date;
  }>,
): Intern => {
  ensureEditable(intern);
  return {
    ...intern,
    ...parseDetails({ ...details, username: intern.username }),
    airtableRecordId,
    airtableFields,
    updatedAt: now,
  };
};
