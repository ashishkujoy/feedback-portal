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
