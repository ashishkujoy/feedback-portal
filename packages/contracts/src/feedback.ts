import { z } from 'zod';
import { ColorCode } from './color-code.ts';
import { FeedbackState } from './feedback-state.ts';

const bodyMax = 20_000;

const Body = z.string().max(bodyMax, { error: `Feedback must be at most ${bodyMax} characters` });

/**
 * A draft's content (9.3), shared with the dialog (9.5). The body may be blank in a draft; with
 * `submit: true` the entry is submitted in the same request, where a blank body is refused
 * ("Write your feedback before submitting."). Which months can be chosen depends on the batch
 * and today, so the API checks that.
 */
export const FeedbackContentRequest = z.object({
  period: z
    .string({ error: 'Choose the month this feedback covers.' })
    .regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, { error: 'Choose the month this feedback covers.' }),
  body: Body,
  colorCode: ColorCode.nullable(),
  givesNotice: z.boolean(),
  submit: z.boolean().optional(),
});
export type FeedbackContentRequest = z.input<typeof FeedbackContentRequest>;

/**
 * `PATCH …/feedback/:id` (9.8): the author changes submitted feedback until it's delivered —
 * month, text, colour and notice, by the same rules as submitting.
 */
export const FeedbackEditRequest = FeedbackContentRequest.omit({ submit: true });
export type FeedbackEditRequest = z.input<typeof FeedbackEditRequest>;

/**
 * One feedback entry as its readers see it. Times are UTC ISO strings, for the browser to show
 * in the viewer's own time zone; `period` is a calendar month (`YYYY-MM-01`).
 */
export const FeedbackView = z.object({
  id: z.uuid(),
  internId: z.uuid(),
  period: z.iso.date(),
  body: z.string(),
  colorCode: ColorCode.nullable(),
  /** The colour of the coloured feedback submitted before this one; `null` without a colour. */
  previousColorCode: ColorCode.nullable(),
  givesNotice: z.boolean(),
  state: FeedbackState,
  author: z.object({ id: z.uuid(), name: z.string(), avatarUrl: z.url().nullable() }),
  conversationId: z.uuid().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** When its author last changed it after submitting (9.8); `null` if never. */
  editedAt: z.iso.datetime().nullable(),
});
export type FeedbackView = z.infer<typeof FeedbackView>;
