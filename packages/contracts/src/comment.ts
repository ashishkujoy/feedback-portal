import { z } from 'zod';

const bodyMax = 2_000;

/**
 * A comment as its author writes it (10.4): plain text, as v2 draws a one-line "Add a comment"
 * input (decision 2). Stored exactly as typed.
 */
export const CommentRequest = z.object({
  body: z
    .string()
    .max(bodyMax, { error: `Comments must be at most ${bodyMax} characters` })
    .refine((body) => /\S/.test(body), { error: 'Write a comment.' }),
});
export type CommentRequest = z.input<typeof CommentRequest>;

/** What a comment is on: a feedback entry or a conversation (10.1 decision 4). */
export const CommentParent = z.object({
  kind: z.enum(['feedback', 'conversation']),
  id: z.uuid(),
});
export type CommentParent = z.infer<typeof CommentParent>;

const Person = z.object({ id: z.uuid(), name: z.string(), avatarUrl: z.url().nullable() });

/**
 * A comment as its readers see it. A deleted one keeps its author and dates, with `body: ''` and
 * `deletedAt`, so the thread shows "This comment was deleted." (decision 4). Times are UTC ISO.
 */
export const CommentView = z.object({
  id: z.uuid(),
  parent: CommentParent,
  author: Person,
  body: z.string(),
  createdAt: z.iso.datetime(),
  /** When the body was changed; `null` if never. */
  editedAt: z.iso.datetime().nullable(),
  deletedAt: z.iso.datetime().nullable(),
});
export type CommentView = z.infer<typeof CommentView>;
