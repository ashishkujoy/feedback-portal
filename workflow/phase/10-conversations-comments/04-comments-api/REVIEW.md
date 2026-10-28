# 10.4 Comments API — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/src/comment.ts`, `problem.ts` | **`CommentRequest`** (plain text, "Write a comment.", at most 2,000 characters, stored as typed), **`CommentParent`**, **`CommentView`** (parent, author, body, `createdAt`, `editedAt`, `deletedAt`). New error code **`comment_deleted`**. |
| `feedback/domain/comment.ts`, `comment-id.ts` | **`addComment`** (members only; submitted or delivered feedback, or a conversation; "Drafts can't be commented on."), **`editComment`** (the author only; unchanged isn't marked; a deleted one is 409 `comment_deleted`), **`deleteComment`** (clears the body; again changes nothing). All refuse archived batches and read-only interns. |
| `feedback/application/manage-comments.ts`, `comment-repository.ts`, `comment-queries.ts`, `feedback-admin.ts` | `listComments`, `addComment` (the parent loaded; someone else's draft, unknown and another intern's parents are 404), `editComment` and `deleteComment` (the comment **locked**; another intern's path is 404). |
| `feedback/infrastructure/drizzle-comment-*.ts`, `drizzle-feedback-admin.ts` | The repository (`FOR UPDATE OF comments`, so the parent isn't locked; the intern from either parent) and the queries (the intern's comments through both parents, oldest first, with authors). |
| `feedback/http/comment.routes.ts`, `feedback.routes.ts`, `conversation.routes.ts`, `app.ts` | `POST …/feedback/:id/comments` and `POST …/conversations/:id/comments` (201, `Location`); `GET`, `PATCH`, `DELETE …/interns/:i/comments[/:id]`. Logs carry ids only. |
| `DATA_MODEL.md` | The body is plain text up to 2,000 characters; a **Comments** section in §4 (who comments, the author alone edits and deletes, soft delete). |

## How to verify
```sh
pnpm check     # contracts 84 + web 361 + api 708
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** Contracts 84 (+2), API 708 (+27). Format and lint clean, with no suppressions; no new dependencies. |
| Domain units (12) | Add on submitted, delivered and conversation parents, stored as typed; a draft refused; non-member 403, archived and read-only 409; blank and too long; another intern's parent is a caller bug. Edit marks edited, unchanged is the same object, others 403 (edit and delete), member/archived/read-only checks, the new body checked. Delete clears the body; again is the same object; edit after is 409 `comment_deleted`. |
| Repository (3) | Comments on feedback and on a conversation load back with their intern; an edit and a delete round-trip; **the lock holds the comment (another connection times out with 55P03) but not its parent** (which can still be locked). |
| API (12) | **Add:** 201 with `Location`, the body as typed, the author; on a conversation and on delivered feedback; listed oldest first (to an unassigned admin too). **Who:** mentor, PM and assigned admin 201; unassigned admin 403; a mentor of no batch 404; signed out 401; only three saved. **Parents:** own draft 409 "Drafts can't be commented on."; someone else's draft, unknown feedback, another intern's feedback, unknown conversation, and a conversation under another intern's path all 404; nothing saved. Blank body 400 with its field message. **Edit:** unchanged not marked; changed gets `editedAt`; another mentor, the PM and an admin 403; **after unassignment** the mentor gets 404 and an admin (who still sees the batch) 403; unknown comment and another intern's path 404. **Delete:** another mentor 403; 204 and listed with `body: ''` and `deletedAt`; again 204 with nothing changed; edit after 409 `comment_deleted`. **Edit and delete at once:** `[200, 204]` or `[409, 204]`, never a 500, and it ends deleted. **Archived** and **read-only:** add, edit and delete all 409 with `batch_archived` / `intern_read_only`, the comment unchanged. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **5, all caught:** no author check on edit (2 tests); drafts allowed (2); `editedAt` set when unchanged (2); **no row lock** (the repository's lock test); locking the parent too (3). **The no-lock mutation survived the API race test at first** (5 runs: the two requests rarely overlap in one process), so the repository lock test was added, as the intern repository has, and it catches it every time. |

## Decisions & trade-offs
- **All four as recommended:** the author alone edits and deletes; plain text; create under the parent, the rest under the intern; deleting twice is 204, and deleted comments stay listed.
- **Membership is checked before authorship:** an unassigned admin editing their own comment gets 403 for not being a member, and a former mentor gets 404 because they no longer see the batch (as everywhere else).
- **The API race test is kept** as a check that the outcome is always consistent and never a 500, though the lock itself is proven by the repository test.
- **The domain has its own `Membership`** (`isMember`, `isArchived`) rather than widening 10.2's `BatchRole`, which is about the PM.

## Deviations from plan
- **A repository test for the lock** was added (see Mutations).
- `BatchRole` wasn't changed (see above).

## Not done / follow-ups
- **10.5:** the Comment button and composer on cards, threads, "N comments below", Edit and Delete on your own comments.
- **10.6:** comments on the unified timeline ("commented on Anjali Deshpande's feedback (8 Oct)").
