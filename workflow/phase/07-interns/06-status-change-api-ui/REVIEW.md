# 7.6 Status change API + UI — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/src/intern.ts` (+ test) | **`StatusAction`** (`lift_notice`, `terminate`, `graduate`, `withdraw`) and **`ChangeStatusRequest`** `{ action, reason }`. The reason is trimmed, 1–20,000 characters, with "Add a reason." when empty. |
| `apps/api/src/modules/intern/domain/intern.ts` (+ test) | The reason message is now **"Add a reason."** (decision 3). |
| `intern/application/intern-repository.ts`, `infrastructure/drizzle-intern-repository.ts` (+ int test) | **`findByIdForUpdate`:** the same load as `findById`, with `for update` on the interns row. |
| `intern/application/batch-access.ts`, `cohort/infrastructure/drizzle-batch-access.ts` | `BatchAccess` gains **`isProgramManager`**, which was already computed for `canManage`. |
| `intern/application/manage-interns.ts` | **`changeStatus`**, in one transaction:<br>• not visible → 404;<br>• **not the batch's current PM → 403** (decision 1);<br>• archived → 409 `batch_archived` (decision 2);<br>• **lock the intern** (decision 4), and another batch's → 404;<br>• the 7.2 operation for the action (a new event id, the actor, now);<br>• save, then read the detail back. |
| `intern/http/interns.routes.ts` | **`POST /batches/:batchId/interns/:internId/status-changes`** → 200 `InternDetail` (decision 5). It's for PMs by role; the use case checks the batch. **Logs carry ids and the action, never the reason.** |
| `apps/web/src/interns/profile/status-actions.ts` (+ test) | **Pure:** v2's header buttons per status, shown to the batch's PM only (not archived, not final), and **P18–P21's copy without pronouns**. The "failure" title for each action. |
| `interns/profile/status-dialog.tsx` | **The 520px dialog:**<br>• the points in a `--muted` box (12px 14px, 13/20, bulleted);<br>• **Reason** (required; a 5-row mono Textarea; "Markdown supported. Kept in the status history."; "Add a reason." from the contract);<br>• Cancel, and the action in its variant (Terminate intern is destructive).<br>A refusal shows an `issue` Callout and keeps the reason. **On success** it shows the API's answer on the profile and refreshes the roster (exact key), the batch and the batch list. |
| `pages/intern-page.tsx`, `api/interns.ts` | The header's buttons on the right; `changeStatus`. |
| `README.md`, `design/README.md` | The endpoint, and **"Status changes (P18–P21) as built in 7.6"**. |

## How to verify
```sh
pnpm check     # contracts 67 + web 219 + api 494
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 67 (+2) + 219 (+16) + 494 (+12). Format and lint clean, with no suppressions. |
| Repository lock (1) | While one transaction holds `findByIdForUpdate`, another (with a 200ms `lock_timeout`) fails with `55P03`. Afterwards the row can be locked again. |
| Routes (11) | **All five allowed changes:** graduate and withdraw from Active; withdraw, lift notice and terminate from On notice. Each gives the new status, `noticeEndsOn` cleared, and the newest event with the trimmed Markdown reason and the actor. **Graduate while on notice → 409 `invalid_status_transition`; withdraw once graduated → 409 `intern_read_only`.** A blank reason → 400 "Add a reason.". **An admin (not the PM) and a mentor (a PM elsewhere) → 403; a PM not on the batch → 404**; another batch's intern → 404; archived → 409; signed out → 401. **Graduate and withdraw at the same time → one 200 and one 409, with exactly 2 events** (the onboarding one plus one change). It passed 3 runs out of 3. |
| Web (16) | **Buttons:** Withdraw (ghost-muted), Graduate (outline) while active; Withdraw, Terminate (destructive), Lift notice (outline) on notice. None when final, for an admin who isn't the PM, a mentor, or an archived batch. **Copy:** P18–P21 exactly, and a test that **no pronoun appears**. **Dialog:** the points, focus on Reason, the help text, "Add a reason." with nothing sent. **Saving** sends `{ action, reason }`, closes, and shows the final banner with no buttons. **A 409** shows "We couldn't withdraw Ishita Rao" and keeps the reason. Terminate's button is destructive. Cancel sends nothing. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **5, all caught:**<br>• the PM check removed (a mentor who is a PM elsewhere gets through);<br>• the archived check removed;<br>• **the lock removed** (`findById`): the concurrent test failed **3 runs out of 3**;<br>• Terminate offered while Active;<br>• the contract not checking the reason (contract and web). |
| **Browser** (Compose, headless Chrome at 1440, as the batch's PM; three interns added through the API, one put on notice directly in the database) | **Active:** Withdraw and Graduate. **The Graduate dialog** is 520px; "Graduate Aarav Sharma · Use this when Aarav completes the programme."; the points box `--muted` with 12px 14px padding, 13/20, an 18px indent and 4px gaps; Reason a 5-row mono 13px textarea with 10px 12px padding, focused, with the help text. **Empty → "Add a reason."** (red border). **With a reason:** the dialog closed; the badge read Graduated; "This intern graduated on 24 Oct 2026. Their record is read-only."; no buttons; the history shows "Active → Graduated by Rajesh Menon" with the bold Markdown. **On notice:** Withdraw, Terminate (destructive red), Lift notice. **Lift notice:** "Ishita returns to Active."; "The notice from 8 Oct 2026 stays in the status history."; "The colour code stays Red until new coloured feedback."; afterwards Active, no notice banner, and Withdraw / Graduate again. **Put on notice again** in the database, then **Terminate:** "Terminate Ishita Rao? · This ends Ishita's place in the programme."; the destructive "Terminate intern"; afterwards Terminated and "was terminated on …". **Withdraw** Dev: "withdrew on …". **The roster table** showed Graduated, Withdrawn and Terminated with Read-only; **the batch card** "Terminated 1". **An admin who isn't the PM:** no buttons. |
| Clean-up | Test users, sessions, the batch, interns and events deleted. The trigger was bypassed only inside the cleanup transaction, and is still enabled. Only your account (and its own session) remains. Chrome stopped; tokens and screenshots removed. |

## Decisions & trade-offs
- **All five decisions as recommended.**
- **An admin with the Programme manager role who runs the batch can change statuses.** The check is "is the batch's current PM", not "isn't an admin".
- **A refresh bug found and fixed while testing.** Refreshing the roster by key prefix also refetched the profile just updated from the answer, briefly showing stale data. The roster is now refreshed by exact key.
- **The browser check put an intern on notice directly in the database** (as an event row), since notice comes from feedback in Phase 9.

## Deviations from plan
- None in scope. The route also requires the Programme manager role, so admin-only users are refused before the use case (403 either way).

## Not done / follow-ups
- **Phase 9:** giving notice through feedback, and "Linked feedback" on history rows.
- **7.7** photos and **7.9** Edit details are next in Phase 7.
