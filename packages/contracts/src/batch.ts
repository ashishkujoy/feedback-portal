import { z } from 'zod';
import { BatchMemberRole } from './batch-member-role.ts';

const isoDate = (field: string) => z.iso.date({ error: `${field} must be a valid date` });

/** `POST /batches`. The same limits as the API's domain, so the web form can check them first. */
export const CreateBatchRequest = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: 'Name is required' })
      .max(100, { error: 'Name must be at most 100 characters' }),
    startDate: isoDate('Start date'),
    endDate: isoDate('End date'),
    programManagerId: z.uuid({ error: 'Choose a programme manager' }),
  })
  // ISO dates compare correctly as strings.
  .refine((batch) => batch.endDate > batch.startDate, {
    error: 'End date must be after the start date',
    path: ['endDate'],
    // Only once both dates are valid; an invalid one already has its own message.
    when: ({ issues }) =>
      !issues.some((issue) => issue.path?.[0] === 'startDate' || issue.path?.[0] === 'endDate'),
  });
export type CreateBatchRequest = z.input<typeof CreateBatchRequest>;

/** `PUT /batches/:id/program-manager` and `POST /batches/:id/mentors`. */
export const AssignUserRequest = z.object({ userId: z.uuid() });
export type AssignUserRequest = z.input<typeof AssignUserRequest>;

const Person = z.object({ id: z.uuid(), name: z.string(), avatarUrl: z.url().nullable() });

/** A batch as the list shows it. Dates are `YYYY-MM-DD`. */
export const BatchSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  isArchived: z.boolean(),
  programManager: Person,
  /** Current mentors. */
  mentorCount: z.int().nonnegative(),
  /** Current mentors, in the order they were assigned (for the card's avatars). */
  mentors: z.array(Person),
});
export type BatchSummary = z.infer<typeof BatchSummary>;

/** One assignment; `unassignedAt: null` means current. */
export const BatchMemberView = z.object({
  id: z.uuid(),
  user: Person.extend({ email: z.email(), isActive: z.boolean() }),
  role: BatchMemberRole,
  assignedAt: z.iso.datetime(),
  unassignedAt: z.iso.datetime().nullable(),
});
export type BatchMemberView = z.infer<typeof BatchMemberView>;

/** A batch with its members, current and past, in the order they were assigned. */
export const BatchDetail = BatchSummary.extend({ members: z.array(BatchMemberView) });
export type BatchDetail = z.infer<typeof BatchDetail>;
