# 9.3 Feedback API — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/src/feedback.ts` (+ test) | **`FeedbackContentRequest`** `{ period, body, colorCode, givesNotice, submit? }` (9.2's messages), **`FeedbackBodyRequest`** `{ body }`, **`FeedbackView`** (with the author, and times as UTC ISO strings). |
| `apps/api/src/shared/calendar-date.ts` (+ test) | **`utcToday(now)`** (decision 3). |
| `intern/application/batch-access.ts`, `cohort/infrastructure/drizzle-batch-access.ts` | The grant gains **`isMember`** (a current mentor or PM assignment) and **`startDate`**, in the same `for share` query. |
| `feedback/application/manage-feedback.ts`, `feedback-admin.ts`, `feedback-queries.ts` | **`listFeedback`, `createFeedback`, `updateDraft`, `editSubmittedFeedback`, `discardFeedback`**, each in one transaction:<br>• **access:** a batch you can't see → 404; a write without a current assignment → **403** "Only this batch's mentors and programme manager write feedback." (decision 2); archived → 409;<br>• **an intern of another batch → 404**;<br>• **someone else's draft → 404** (drafts are invisible), checked before the domain's author check;<br>• **submitting locks the intern's row** first, so two submissions for one intern run in turn;<br>• `submit: true` on create and edit **submits in the same transaction** (decision 1), so a refused one leaves nothing;<br>• the month range from the batch's start and **the UTC date** (decision 3). |
| `feedback/infrastructure/drizzle-feedback-queries.ts`, `drizzle-feedback-admin.ts` | The list joins each author's name and photo, **filters drafts to the viewer's own in SQL**, and orders drafts first, then newest submitted. |
| `feedback/http/feedback.routes.ts`; `app.ts`, `main.ts`, `test/app-deps.ts` | **`GET`, `POST`, `PUT /:id`, `PATCH /:id`, `DELETE /:id`** at `/batches/:batchId/interns/:internId/feedback`, mounted before the interns router. 201 with `Location`; 204 on discard. **Logs carry ids and the state, never the text.** `realApp` gains `setTime` for clock-specific tests. |
| `README.md` | The endpoints, access, and "times are UTC". |

## How to verify
```sh
pnpm check     # contracts 76 + web 261 + api 618
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 76 (+4) + 261 + 618 (+17). Format and lint clean, with no suppressions or casts. |
| Routes (16, Testcontainers, at 24 Oct 2026 UTC) | **Drafts:** created (201, `Location`, blank body, author's name, UTC `createdAt`), edited (month, text, no colour), listed, discarded (204). **Invisible:** the PM and another mentor see no draft and get **404** on PUT, PATCH and DELETE; the unassigned admin sees none and gets **403**; the draft is untouched. **One-step submit with notice:** submitted, Red, the intern On notice until 24 Nov with the event (today's start, the feedback id, the mentor, "Notice given in the October 2026 feedback."). **A refused one-step submit** (blank text): 400 "Write your feedback before submitting.", **no row**, the colour unchanged. **Draft → submitted** with PUT, then a PATCH text edit; PUT and DELETE afterwards → 409 `feedback_not_draft`. **Two notices at once** (two mentors): **one 201, one 409 `intern_not_active`, one notice event.** **List order:** the viewer's draft, then the newer and older submitted; another mentor's draft hidden. **Access:** the PM and an admin assigned as mentor write; the unassigned admin reads but gets 403 with the sentence; a mentor of another batch 404; an intern of another batch 404; signed out 401; archived: reads, 409 on writes; a terminated intern: 409 `intern_read_only`, **discarding the draft still 204**. **Validation:** malformed fields → 400 naming `period`, `body`, `colorCode`, `givesNotice`; June and November → "Choose a month from July 2026 to October 2026." **UTC:** at 23:30 UTC on 31 October (05:00 on 1 November in India), November is refused, `submittedAt` is `…T23:30:00.000Z`, and the notice runs 31 Oct to 30 Nov. **Run 5 times in a row: 16/16 each time** (the concurrency tests are stable). |
| Contracts (4) and `utcToday` (1) | Draft with blank body and optional `submit`; the messages; the text-only body; a valid view and an unknown state refused. `utcToday` gives 31 October for 23:30 UTC and for 05:00 IST on 1 November. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:** the draft filter removed (2 tests); someone else's draft answered 403 (1); the intern not locked on submit (the concurrency test); **admins writing without an assignment** (2). My first attempt at the admin one was a no-op (it read a field the grant doesn't have), so it was redone with `canManage`. |
| Browser | **None:** nothing is visible until 9.5. |

## Decisions & trade-offs
- **All three decisions as agreed:** `submit: true` on create and edit; admins write only where assigned; **UTC on the server, local time on screen.**
- **An unassigned admin gets 403 for any write, even to a draft id that exists,** because the write check comes before the draft lookup. They learn nothing about the draft: the same 403 comes for any id.
- **Timestamps are formatted by the browser** from 9.5 on; the API sends only UTC.

## Deviations from plan
- **`realApp` gained `setTime`**, to run a test at an exact UTC moment.
- **Mutation test fixed:** see above.

## Not done / follow-ups
- **9.5:** the dialog; **9.6:** the profile's feedback list (and local-time display).
- **Delivering** (10.2–10.3) and **comments** (10.4).
- **M26 "My pending"** (a mentor's drafts across batches) and **feedback counts** on cards and tables (v2 A2–A4): not on the roadmap yet.
