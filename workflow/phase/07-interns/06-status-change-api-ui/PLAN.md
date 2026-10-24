# 7.6 Status change API + UI — Plan

**Phase:** 7 — Interns
**Status:** Done

## Goal
Graduate, withdraw, lift notice, or terminate, with a reason

## Done when
- **`POST /batches/:batchId/interns/:internId/status-changes`** with `{ action, reason }` makes the change through 7.2's domain and saves the new event. `action` is one of `lift_notice`, `terminate`, `graduate` or `withdraw`.
- **Only the batch's current programme manager can do this** (the roadmap's "Only the PM can do this"; PRODUCT §10).
- **Final statuses are read-only** (409 `intern_read_only`), and changes the state machine forbids are 409 `invalid_status_transition`.
- **The profile has v2's status buttons and dialogs (P18–P21)** for the PM. The status history, banners, roster and batch counts update after a change.
- API, repository and web tests pass, and `pnpm check` passes. In the browser, each dialog matches v2 and each change shows up straight away.

## What v2 draws
- **Header buttons** (the batch's PM only, and not for a final intern), before the (later) Give feedback:
  - **Active:** **Withdraw** (ghost-muted), **Graduate** (outline).
  - **On notice:** **Withdraw** (ghost-muted), **Terminate** (destructive), **Lift notice** (outline).
- **The dialog** (Kuat Dialog, **520px**):
  - the title and description;
  - a `--muted` box (padding 12px 14px) with a bulleted list (13/20) of what happens;
  - **Reason** (required, a 5-row mono Textarea, with the help text "Markdown supported. Kept in the status history.");
  - Cancel and the action button.
- **Empty reason (P18-errors):** "Add a reason." under the field.

| Dialog | Title, description | Points | Button |
|---|---|---|---|
| **P18 Lift notice** | "Lift notice for \<Name\>" · "\<First\> returns to Active." | The notice from \<date\> stays in the status history. The colour code stays \<colour\> until new coloured feedback. | **Lift notice** (primary) |
| **P19 Terminate** | "Terminate \<Name\>?" · "This ends \<First\>'s place in the programme." | The status changes to Terminated. This can't be undone. The record becomes read-only. Feedback and conversations stay visible. | **Terminate intern** (destructive) |
| **P20 Graduate** | "Graduate \<Name\>" · "Use this when \<First\> completes the programme." | The status changes to Graduated. This can't be undone. The record becomes read-only. | **Graduate** (primary) |
| **P21 Withdraw** | "Withdraw \<Name\>" · "Use this when \<First\> leaves the programme." | The status changes to Withdrawn. This can't be undone. The record becomes read-only. | **Withdraw** (primary) |

**Pronouns:** v2's points say "her" and "his". They're rewritten above as "The status…" and "The record…", since the app can't know an intern's pronouns.

## Decisions needed

### (1) Who can change a status
PRODUCT §10 and the roadmap say **the PM**, and v2 shows the buttons only to the batch's PM.

| Option | What it means |
|---|---|
| **A. Only the batch's current PM** *(recommended)* | As PRODUCT, the roadmap and v2 say. Admins see the buttons only if they are also that batch's PM; otherwise it's a 403. |
| B. The PM and admins | Admins could step in, for example when a PM is away. This differs from PRODUCT and v2. |

### (2) Archived batches
**Recommended: no changes** (409 `batch_archived`), as for everything else in an archived batch (6.2, 7.3). No buttons are shown.

### (3) The reason's message
**Recommended: v2's "Add a reason."** It replaces 7.2's "A reason is required", in the domain and a new shared contract, so both say the same.

### (4) Two changes at once
**Recommended:** the use case **locks the intern's row** (`for update`) while it changes it. If the PM double-submits, or has two tabs open, the second change sees the first one's result. For example, Graduate after Withdraw gets `intern_read_only` instead of overwriting it.

### (5) Answer and refresh
**Recommended:** the endpoint answers with the updated `InternDetail`, so the profile shows the new status, banner and history at once. The roster, the batch and the batch list are refreshed too, since their counts change.

## Plan

### Contracts
- **`ChangeStatusRequest`:** `{ action: 'lift_notice' | 'terminate' | 'graduate' | 'withdraw', reason }`. The reason is trimmed, 1–20,000 characters, with "Add a reason." when empty. These are the domain's limits.

### API
- **7.2's domain:** the reason message becomes "Add a reason." (its tests updated).
- **`InternRepository.findByIdForUpdate(id)`:** the same load as `findById`, with `for update` on the interns row.
- **`BatchAccess`** gains **`isProgramManager`** next to `canManage`. It's already computed there.
- **The `changeStatus` use case,** in one transaction:
  - not visible → 404;
  - not the batch's current PM → 403;
  - archived → 409;
  - load and lock the intern (another batch's → 404);
  - run the domain operation for `action` (with a new event id, the actor and now);
  - save, then read the detail back.
- **`POST /batches/:batchId/interns/:internId/status-changes`** → 200 `InternDetail`. It's open to PMs by role, and the use case checks the batch. Logs carry ids and the action only, never the reason.

### Web
- **`api/interns.ts`:** `changeStatus(batchId, internId, body)`.
- **`interns/profile/status-actions.ts` (pure, tested):** which buttons, for which status, for whom; and each dialog's title, description, points, button and variant.
- **`interns/profile/status-dialog.tsx`:** the 520px dialog with the points box and the Reason textarea (7.3's `Textarea`, `mono`, 5 rows, required).
  - **Errors:** an empty reason shows "Add a reason." from the contract. A 409 or 403 shows an `issue` Callout, "We couldn't \<lift the notice / terminate / …\>", with the API's reason.
  - **After saving,** the dialog closes and the page shows the answer. The roster, batch and batch list are invalidated.
- **The profile header:** the buttons, in v2's order and variants, for the batch's PM while the intern isn't final and the batch isn't archived.

### Tests
- **Repository:** `findByIdForUpdate` holds the row; a second transaction trying to lock it waits until the first ends.
- **Routes (Testcontainers):**
  - each of the four actions from an allowed status → 200: the new status, `noticeEndsOn` cleared where it applies, and the event newest with its reason and actor;
  - **forbidden changes:** graduate while on notice → 409 `invalid_status_transition`; any change once final → 409 `intern_read_only`;
  - an empty reason → 400 "Add a reason.";
  - **access:** an admin who isn't the PM → 403; a mentor → 403; a PM not on the batch → 404; another batch's intern → 404; an archived batch → 409; signed out → 401;
  - **two changes at once** (graduate and withdraw together) → one 200 and one 409, with exactly one new event.
- **Web:**
  - the buttons per status: active → Withdraw, Graduate; on notice → Withdraw, Terminate, Lift notice; none when final, for a mentor, for an admin who isn't the PM, or on an archived batch;
  - each dialog's copy (no pronouns);
  - "Add a reason." and nothing sent;
  - a change sends `{ action, reason }`, closes, and shows the new status, banner and history;
  - a 409 in the Callout, with the reason kept;
  - Cancel sends nothing.
- **Mutations** (on copies, restored with `cp`):
  - the PM check removed (admins allowed);
  - the archived check removed;
  - the row lock removed (the concurrent test);
  - Terminate offered while Active;
  - the reason sent untrimmed or empty.

  Each must fail a test.

### Out of scope
- **Giving notice:** it comes from feedback marked as notice (Phase 9).
- **A "Linked feedback" on history rows** (Phase 9).
- **Undoing a final status.** PRODUCT makes it read-only; a data fix would be a separate decision.

### Steps
1. Contract, domain message, repository lock, `BatchAccess` and use case, with tests.
2. The route, with tests, including the concurrent one.
3. The pure actions and copy, the dialog, and the header buttons, with tests.
4. Run `pnpm check`, run the mutations, do the browser check (Compose, headless Chrome as the batch's PM: graduate an active intern, lift a notice, then terminate after giving notice again in the database, and withdraw; dialogs measured against v2; an empty reason; as an admin who isn't the PM, no buttons), and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- In the browser, the dialogs match P18–P21 and every change appears at once in the header, banners, history, roster and batch card.
- The test rows are deleted afterwards.
