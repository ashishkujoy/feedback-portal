import { z } from 'zod';
import { ColorCode } from './color-code.ts';

const Person = z.object({ id: z.uuid(), name: z.string(), avatarUrl: z.url().nullable() });
const InternRef = z.object({ id: z.uuid(), name: z.string(), photoUrl: z.url().nullable() });
const BatchRef = z.object({ id: z.uuid(), name: z.string() });

/**
 * `GET /me/pending` (v2 M26 / P26, 11.2): the signed-in user's open work across the batches they
 * currently mentor or run, leaving out archived batches and those that haven't started. Only
 * interns whose record can still change (Active or On notice) appear. Times are UTC ISO.
 */
export const MyPending = z.object({
  /** This month's feedback period (UTC), `YYYY-MM-01`. */
  month: z.iso.date(),
  /** Interns without your submitted feedback for `month`, by batch, then name. */
  needsFeedback: z.array(
    z.object({
      intern: InternRef,
      batch: BatchRef,
      colorCode: ColorCode.nullable(),
      /** The latest submitted feedback from anyone; `null` when there's none. */
      lastFeedback: z.object({ submittedAt: z.iso.datetime(), author: Person }).nullable(),
    }),
  ),
  /** Your drafts, the last edited first. */
  drafts: z.array(
    z.object({
      feedbackId: z.uuid(),
      intern: InternRef,
      batch: BatchRef,
      period: z.iso.date(),
      body: z.string(),
      colorCode: ColorCode.nullable(),
      updatedAt: z.iso.datetime(),
    }),
  ),
  /** Submitted feedback not yet delivered, in the batches you're the PM of; newest first. */
  toDeliver: z.array(
    z.object({
      feedbackId: z.uuid(),
      intern: InternRef,
      batch: BatchRef,
      author: Person,
      submittedAt: z.iso.datetime(),
      colorCode: ColorCode.nullable(),
    }),
  ),
});
export type MyPending = z.infer<typeof MyPending>;
