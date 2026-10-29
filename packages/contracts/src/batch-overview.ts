import { z } from 'zod';
import { ColorCode } from './color-code.ts';

const count = z.int().nonnegative();
const Person = z.object({ id: z.uuid(), name: z.string(), avatarUrl: z.url().nullable() });
const InternRef = z.object({ id: z.uuid(), name: z.string(), photoUrl: z.url().nullable() });

/**
 * `GET /batches/:batchId/overview` (v2 A24, 11.1). Current interns are those not terminated or
 * withdrawn ("Excludes terminated and withdrawn."). Dates are `YYYY-MM-DD`, times UTC ISO.
 */
export const BatchOverview = z.object({
  /** Current interns, and how many of them are on notice. */
  current: count,
  onNoticeCount: count,
  /** Current interns by colour; `none` for those without one. */
  colours: z.object({
    green: count,
    yellow: count,
    borderline_yellow: count,
    orange: count,
    borderline_red: count,
    red: count,
    none: count,
  }),
  /** Interns on notice, the soonest ending first, with who issued the notice. */
  onNotice: z.array(
    z.object({
      intern: InternRef,
      noticeStartsOn: z.iso.date().nullable(),
      noticeEndsOn: z.iso.date(),
      issuedBy: Person.nullable(),
    }),
  ),
  /** Submitted feedback not yet delivered in a conversation, newest first. */
  toDeliver: z.array(
    z.object({
      feedbackId: z.uuid(),
      intern: InternRef,
      author: Person,
      submittedAt: z.iso.datetime(),
      colorCode: ColorCode.nullable(),
    }),
  ),
});
export type BatchOverview = z.infer<typeof BatchOverview>;
