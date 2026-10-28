# 10.4 Comments API — Plan

**Phase:** 10 — Conversations & comments
**Status:** Done

## Goal
Add, edit, and soft-delete comments on feedback or a conversation

## Done when
- **API** (the batch's current mentors and PM write; anyone who can see the batch reads):
  - **`POST /batches/:b/interns/:i/feedback/:feedbackId/comments`** and **`POST …/conversations/:conversationId/comments`**: `{ body }` → 201 with the comment and `Location`.
  - **`PATCH /batches/:b/interns/:i/comments/:id`**: `{ body }` → 200. A changed body sets `editedAt` ("· edited"); an unchanged one isn't marked.
  - **`DELETE …/comments/:id`** → 204. A soft delete: the body is cleared and `deletedAt` set; the row stays, so the thread still shows "This comment was deleted." with its author and date.
  - **`GET /batches/:b/interns/:i/comments`**: every comment on the intern's feedback and conversations, oldest first, each with its parent (`{ kind: 'feedback' | 'conversation', id }`), author, body, `createdAt`, `editedAt` and `deletedAt`. One request serves both 10.5's threads and 10.6's timeline.
- **Rules** (DATA_MODEL §4 and §5, and the design):
  - A comment goes on **submitted or delivered** feedback, or on a conversation, of this intern. Your own draft is 409 "Drafts can't be commented on."; someone else's draft, unknown parents and another intern's parents are 404.
  - **Writers:** current mentors and the PM of the batch (`isMember`); an admin only when assigned. Others who can see the batch get 403.
  - **Edit and delete are the author's own** (v2 shows Edit and Delete only on "mine"), while they're still a member. Anyone else gets 403.
  - Nothing is added or changed in an **archived batch** (409 `batch_archived`) or for a **read-only intern** (409, as v2's "Nothing can be added or changed.").
  - A **deleted comment can't be edited** (409 `comment_deleted`, "This comment was deleted."). Deleting it again is 204 with no change.
  - The body: required ("Write a comment."), at most 2,000 characters, and stored exactly as typed.
  - Edits and deletes lock the comment row, so an edit racing a delete can't write to a deleted comment (the trigger would refuse it with a 500).
- API tests pass; `pnpm check` passes.

## Decisions
**All accepted as recommended** (decision 1: (a), the author only).

### (1) Who edits and deletes
v2 shows **Edit** and **Delete** only on the viewer's own live comments.
- **(a) Recommended: the author only**, while still a mentor or PM of the batch. The PM can't remove others' comments; feedback isn't deletable either, and the record stays as written.
- **(b)** The author, plus the batch's PM for moderation (delete only).

### (2) Plain text, not Markdown
v2 draws a one-line **Input** ("Add a comment") and shows the text plain, unlike feedback and conversation notes. **Recommended:** comments are **plain text**, at most 2,000 characters; 10.5 shows them with line breaks kept and no Markdown.

### (3) Routes
**Recommended:** create under the parent (`…/feedback/:id/comments`, `…/conversations/:id/comments`), so the parent kind comes from the path; edit, delete and list under the intern (`…/interns/:i/comments[/:id]`), since a comment's id is enough and the timeline wants them all at once.

### (4) Deleting twice, and deleted comments in the list
**Recommended:** a second `DELETE` is 204 (the comment is already gone). Deleted comments stay in the list with `body: ''` and `deletedAt`, as v2 shows "Sana Qureshi · 17 Oct — This comment was deleted."

## Plan
- **Contracts** (`packages/contracts/src/comment.ts`): `CommentRequest` (`{ body }`), `CommentView`.
- **Domain** (`feedback/domain/comment.ts`, `comment-id.ts`):
  - `addComment({ id, parent, intern, actor, batch, body, now })`: the parent must be submitted/delivered feedback or a conversation of the intern; member, not archived, intern editable; body parsed.
  - `editComment(comment, …)` and `deleteComment(comment, …)`: the author only; not deleted (edit); no change when unchanged or already deleted.
  - `BatchRole` gains `isMember` (10.2's type, shared).
- **Application** (`manage-comments.ts`, `comment-repository.ts`, `comment-queries.ts`): `addComment`, `editComment`, `deleteComment` (row locked with `findByIdForUpdate`), `listComments`; reuses `ensureCanSee` and `internIn`.
- **Infrastructure:** `drizzle-comment-repository.ts`, `drizzle-comment-queries.ts` (the intern's comments through both parents, with authors).
- **HTTP:** `comment.routes.ts`, and the two `POST`s mounted under the existing feedback and conversation paths; logs carry ids only.
- **Docs:** DATA_MODEL (who edits and deletes, plain text); `design/README.md` only if anything shown changes (it shouldn't; UI is 10.5).

### Tests
- **Domain units:** add on submitted, delivered and conversation parents; draft refused; non-member 403; archived and read-only 409; blank and too long; edit by the author marks edited, unchanged isn't marked, others 403, deleted 409; delete clears the body and is idempotent.
- **API (integration):**
  - add on feedback and on a conversation (201, `Location`, listed);
  - a mentor, the PM and an assigned admin can add; an unassigned admin 403; another batch 404; signed out 401;
  - own draft 409; someone else's draft, unknown parent and another intern's parent 404;
  - archived batch and read-only intern 409 (add, edit, delete);
  - edit (`editedAt`; unchanged not marked; another user 403; the author after unassignment 404);
  - delete (204; listed with `body: ''` and `deletedAt`; a second delete 204; edit after delete 409);
  - **an edit racing a delete:** both end in a 2xx or a 409, never a 500, and the comment ends deleted or edited consistently;
  - list order (oldest first) across both parents, and content.
- **Mutations** (on copies, restored with `cp`, checked with `cmp`): no author check on edit; comments allowed on drafts; no row lock on edit/delete; `editedAt` set when unchanged.

### Out of scope
- **The UI** (10.5): the Comment button, the composer, threads, "N comments below".
- **Comments on the timeline** (10.6).
- Notifications.

### Steps
1. Contracts and the domain with its unit tests.
2. Repository, queries, use cases, routes.
3. API tests, docs, `pnpm check`, mutations, `REVIEW.md`.

### Verification
- `pnpm check` exits 0; the mutations fail tests. No browser check: there's no UI in this task.
