# 9.3 Feedback API — Plan

**Phase:** 9 — Feedback
**Status:** Done

## Goal
Feedback API: create draft, edit, submit, and list per intern (drafts visible to the author only)

## Done when
Mounted at **`/batches/:batchId/interns/:internId/feedback`** (before the interns router, as 8.3's imports are):

| Method | Path | What | Answer |
|---|---|---|---|
| `GET` | `/` | The intern's submitted and delivered feedback, **plus the viewer's own drafts** | 200 `FeedbackView[]` |
| `POST` | `/` | A new draft, **or a new entry submitted at once** with `submit: true` (decision 1) | 201 `FeedbackView`, `Location` |
| `PUT` | `/:feedbackId` | Replace a draft's month, text, colour and notice; `submit: true` submits it in the same request | 200 `FeedbackView` |
| `PATCH` | `/:feedbackId` | `{ body }`: the author's text edit after submission | 200 `FeedbackView` |
| `DELETE` | `/:feedbackId` | Discard a draft | 204 |

- **Submitting** (POST or PUT with `submit: true`) runs 9.2's `submitFeedback` and saves the feedback and the intern in **one transaction, with the intern's row locked**, so two submissions for the same intern (two colours, two notices) go one after the other: the second sees the first's colour and status.
- **Access** (DATA_MODEL §5, decision 2) and **errors** as below; `pnpm check` passes; API tests pass (the roadmap's "Done when").

## Access
| Who | Read | Write (create, edit, submit, discard) |
|---|---|---|
| A **current mentor or the PM** of the batch | Submitted and delivered feedback, and their own drafts | ✅ their own entries |
| An **admin** not assigned to the batch | Submitted and delivered feedback | ❌ **403** "Only this batch's mentors and programme manager write feedback." (DATA_MODEL §5 \*) |
| An admin who **is** assigned | As a mentor or PM | ✅ |
| Anyone else (not assigned, or unassigned since) | **404**, as for the batch | 404 |

- **Someone else's draft is a 404,** never a 403: drafts are invisible to everyone but their author.
- **An archived batch:** reads work; writes are **409 `batch_archived`**.
- **A read-only intern:** 9.2's 409 `intern_read_only` (discarding a draft still works).
- **An intern from another batch** in the path: 404.

## Contracts (`packages/contracts/src/feedback.ts`)
- **`FeedbackContentRequest`:** `{ period, body, colorCode, givesNotice, submit? }`, with 9.2's messages, shared with the dialog (9.5). The month range is checked by the domain (it needs the batch and today).
- **`FeedbackBodyRequest`:** `{ body }`.
- **`FeedbackView`:** `{ id, internId, period, body, colorCode, previousColorCode, givesNotice, state, author: { id, name, avatarUrl }, submittedAt, createdAt, updatedAt, conversationId }`. **Ordered newest first** (submitted by `submittedAt`, drafts by `updatedAt`, drafts on top).

## Decisions

### (1) Submitting a new entry in one step (recommended A)
v2's dialog has **Save draft** and **Submit feedback** side by side, so "Submit" on a new entry must create and submit.

| Option | What it means |
|---|---|
| **A. `submit: true` on POST and PUT** *(recommended)* | One request, one transaction: either a submitted entry exists, or nothing does. A refused submission (blank text, intern already on notice) leaves no half-made draft behind. |
| B. Always create a draft, then `POST /:id/submit` | Two requests; a failed submit leaves a draft the mentor didn't ask for. |

### (2) Admins (as recommended)
**Recommended: as DATA_MODEL §5 says:** admins read everything, but write only where they're assigned as mentor or PM. The access port gains `isMember` (a current mentor or PM assignment) next to `canManage`.

### (3) Time: UTC on the server, the viewer's zone on screen (agreed)
**Everything is stored and computed in UTC;** the web app shows times in the viewer's own time zone (9.5, 9.6). No time-zone setting.
- **Timestamps** (`submittedAt`, `createdAt`, `updatedAt`) are `timestamptz` and go out as ISO strings in UTC; the browser formats them locally.
- **"Today"** for the calendar dates the domain needs (a notice's start and end, the latest month that can be chosen) is **the UTC date**. So for a few hours around midnight it differs from the viewer's local date: for example at 02:00 on 1 November in India it's still 31 October in UTC, so November can't be chosen yet and a notice given then starts on 31 October.
- **Calendar dates** (`period`, notice dates, batch dates) have no time zone and are shown as they are.

## Plan
- **Contracts:** `feedback.ts` (above), exported; tests for the messages and `FeedbackView`.
- **Time:** a `utcToday(now)` helper in `shared/calendar-date.ts` (decision 3); no new setting.
- **Access:** `BatchAccessGrant` gains **`isMember`** and **`startDate`** (for the month range); `createBatchAccess` fills them in the same query.
- **Application (`modules/feedback/application/manage-feedback.ts`):** `listFeedback`, `createFeedback`, `updateDraft`, `editSubmittedFeedback`, `discardFeedback`. Each in one transaction: access (404 / 403 / 409), the intern **locked** when submitting (`findByIdForUpdate`), the domain, `save`. A `FeedbackQueries` port lists the views (with the authors' names and photos), filtering drafts to the viewer's own **in SQL**.
- **HTTP (`modules/feedback/http/feedback.routes.ts`):** the five routes, Zod-validated params and bodies, `Location` on 201, logs with ids only (never the body).
- **Wiring:** `main.ts`, `app.ts`, `test/app-deps.ts`.
- **README:** the endpoints, and that times are UTC on the server.

### Tests (Testcontainers, `feedback.routes.int.test.ts`)
- **Drafts:** a mentor creates one (201, `Location`), edits it, sees it in the list; **the PM, another mentor and an admin don't see it, and get 404 on PUT, PATCH and DELETE**; the author discards it (204).
- **Submit in one step:** POST with `submit: true` → submitted, the intern's colour set, and with notice the intern On notice from today (UTC) with the event. **A refused one-step submission (blank text) leaves nothing.**
- **Submit a draft:** PUT with `submit: true`; then **PATCH** edits the text; PUT on it now is 409 `feedback_not_draft`.
- **Concurrency:** two notices submitted at once for the same intern → one 200, one 409 `intern_not_active`; one notice event.
- **Access:** the PM writes; an unassigned admin reads but gets 403 on POST; an admin assigned as mentor writes; a mentor of another batch gets 404; signed out 401; an archived batch reads but gets 409 on writes; a read-only intern 409; an intern from another batch 404.
- **Validation:** a malformed body or month → 400 with field issues; a month outside the batch → 400 on `period`.
- **List order:** drafts first, then newest submitted.
- **UTC "today":** with the clock at 23:30 UTC on 31 October (already 1 November in India), November is refused and a notice starts on 31 October; timestamps come back as UTC ISO strings.
- **Mutations** (on copies, restored with `cp`): the draft filter removed (another person sees a draft); admins allowed to write without an assignment; the intern not locked on submit (the concurrency test); someone else's draft answered 403 instead of 404. Each must fail a test.

### Out of scope
- **Delivering** (conversations, 10.2–10.3) and **comments** (10.4).
- **The dialog and the profile's feedback list** (9.5, 9.6), and **M26 "My pending"** (a mentor's drafts across batches; not on the roadmap yet).
- **Feedback counts on cards and tables** (v2 A2/A3/A4): with 9.6 or a follow-up.

### Steps
1. Contracts and the `utcToday` helper.
2. The access fields; the use cases and queries, with tests.
3. The routes and wiring, with tests (concurrency and UTC dates included).
4. `pnpm check`, mutations, `REVIEW.md`. No browser check: nothing is visible until 9.5.

### Verification
- `pnpm check` exits 0; the mutations fail tests.
