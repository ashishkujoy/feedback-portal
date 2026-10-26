import { z } from 'zod';

const notesMax = 20_000;

/**
 * What the PM writes when recording a conversation (v2 A8), and when changing it (10.2): the day
 * it was held and the notes. Which days can be chosen depends on the feedback and today, so the
 * API checks that.
 */
export const ConversationContentRequest = z.object({
  heldOn: z.iso.date({ error: 'Choose the date it was delivered.' }),
  notes: z
    .string()
    .max(notesMax, { error: `Notes must be at most ${notesMax} characters` })
    .refine((notes) => /\S/.test(notes), { error: 'Write how the conversation went.' }),
});
export type ConversationContentRequest = z.input<typeof ConversationContentRequest>;

/** `POST …/interns/:internId/conversations`: the feedback it delivers, and the content. */
export const RecordConversationRequest = ConversationContentRequest.extend({
  feedbackId: z.uuid({ error: 'Choose the feedback you went through in the 1:1.' }),
});
export type RecordConversationRequest = z.input<typeof RecordConversationRequest>;

const Person = z.object({ id: z.uuid(), name: z.string(), avatarUrl: z.url().nullable() });

/**
 * A conversation as its readers see it (10.3): who recorded it, the day it was held, the notes,
 * and the feedback it delivered. Times are UTC ISO strings; `heldOn` is a calendar date.
 */
export const ConversationView = z.object({
  id: z.uuid(),
  internId: z.uuid(),
  recordedBy: Person,
  heldOn: z.iso.date(),
  notes: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** When the notes or date were changed after recording; `null` if never. */
  editedAt: z.iso.datetime().nullable(),
  feedback: z.object({
    id: z.uuid(),
    author: Person,
    submittedAt: z.iso.datetime(),
  }),
});
export type ConversationView = z.infer<typeof ConversationView>;
