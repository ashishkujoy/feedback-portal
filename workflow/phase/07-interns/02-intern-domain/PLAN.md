# 7.2 Intern domain — Plan

**Phase:** 7 — Interns
**Status:** Done

## Goal
`Intern` aggregate and the status state machine (transitions, required reasons, notice dates)

## Done when
- **A pure `Intern` aggregate** in `modules/intern/domain`, in the style of `User` and `Batch`: functions return a new value (or the same object when nothing changes), with time, ids and the actor passed in, and no database.
- **It enforces PRODUCT §10:**
  - the allowed status changes, each with a reason;
  - notice running one month from its start;
  - **final statuses (Graduated, Terminated, Withdrawn) being read-only**;
  - every change recorded as a history event matching 7.1's table.
- **Tests cover every allowed and every rejected transition** (all 5 × 5 pairs, plus onboarding). `pnpm check` passes.

## The model
- **`Intern`** = the 7.1 columns (details, `status`, `colorCode`, `noticeEndsOn`, timestamps) plus **`statusEvents`**: the history, owned by the intern, as `Batch` owns its members. An event is `{ id, fromStatus, toStatus, reason, noticeStartsOn, noticeEndsOn, feedbackId, actorId, createdAt }`.
- **Operations append an event and update the denormalized `status` / `noticeEndsOn` together,** so they can't drift apart. The repository (7.3) inserts only the new events, and the 7.1 trigger guarantees the old ones never change.
- **Errors** are `AppError`s:
  - `validation_failed` with field issues for bad details or a missing reason;
  - `conflict` with **`invalid_status_transition`** (a change the state machine doesn't allow);
  - `conflict` with **`intern_read_only`** (any change to a graduated, terminated or withdrawn intern).

## The state machine
| From \ To | Active | On notice | Graduated | Terminated | Withdrawn |
|---|---|---|---|---|---|
| *(new)* | **onboard** | — | — | — | — |
| **Active** | — | **give notice** | **graduate** | see (2) | **withdraw** |
| **On notice** | **lift notice** | see (3) | see (1) | **terminate** | **withdraw** |
| Graduated / Terminated / Withdrawn | read-only | read-only | read-only | read-only | read-only |

**Every change except onboarding needs a non-blank reason** (Markdown).

**Giving notice** also takes:
- **the start date**;
- **the feedback that gave it, if any** (Phase 9 passes it; a feedback-less notice is allowed for now, see (4)).

The end date is **start + 1 calendar month**, clamped (31 Jan → 28/29 Feb). Lifting, terminating or withdrawing clears `noticeEndsOn`.

## Decisions needed

### (1) Graduating while on notice
**Recommended: not allowed.** Lift the notice first, then graduate, so the history shows the notice was resolved. Graduating someone on notice would skip that.

### (2) Terminating without notice
PRODUCT: termination is "usually after the notice period ends", and while on notice the PM "can terminate".

| Option | What it means |
|---|---|
| **A. Only from On notice** *(recommended)* | Termination always follows a recorded notice, as PRODUCT describes. |
| B. Also from Active | Covers a sudden dismissal, but bypasses the notice record. |

### (3) Notice while already on notice
**Recommended: rejected** (`invalid_status_transition`). One notice runs at a time. Phase 9 decides what the "Mark as notice" switch does for an intern already on notice; for example, hide it.

### (4) Who may do what
**The domain doesn't check roles.** Authorization belongs to the API, as in 6.3:
- notice is given through feedback, by a mentor or the PM (Phase 9);
- the PM lifts notice, terminates, graduates and withdraws (7.6).

The domain records the `actorId` it's given.

### (5) Intern details
`onboardIntern` and `updateDetails` validate:
- **username:** trimmed, a leading `@` removed, 1–50 characters of letters, digits, `.`, `_` and `-`. It's matched ignoring case, as in 7.1;
- **name:** 1–200;
- **email:** a valid email, lower-cased;
- **the optional fields:** trimmed, with empty becoming null;
- **`interviewNotes`:** Markdown, up to 20,000 characters.

**`updateDetails` on a final-status intern → `intern_read_only`.** **Recommended** as above; the limits match the existing user ones where they overlap.

## Plan
- `modules/intern/domain/intern.ts` (the aggregate, details validation and the operations), plus `intern-id.ts` and `status-event-id.ts` (branded uuids).
- **Operations:**
  - `onboardIntern({ id, eventId, batchId, details, actor, now })` → `active`, with the onboarding event (`from` null, no reason);
  - `giveNotice(intern, { eventId, startsOn, reason, feedbackId, actor, now })`;
  - `liftNotice`, `terminate`, `graduate` and `withdraw` (each `{ eventId, reason, actor, now }`);
  - `updateDetails(intern, { details, now })`;
  - the reads `isReadOnly(intern)` (from contracts' `isFinalStatus`) and `currentNotice(intern)` (the latest notice event while on notice).
- **One internal `transition(intern, to, …)`** that checks the table above. The five named operations are thin wrappers, so the rules live in one place.
- **`packages/contracts/src/problem.ts`:** `invalid_status_transition` and `intern_read_only`.
- **No API, no database and no web changes.**

### Tests (`intern.test.ts`, pure)
- **Every pair in the table:** an allowed change gives the right status, `noticeEndsOn` and event (`from`, `to`, reason, actor and time). **Every other pair throws** `invalid_status_transition`, or `intern_read_only` from a final status. These are generated from the table, so none is missed.
- **Onboarding:** `active`, one event with `from` null and no reason; the details are normalised (`@Ishita.Rao` → `Ishita.Rao`, the email lower-cased, blanks → null); and **invalid details are reported together**.
- **Reasons:** blank or whitespace-only → `validation_failed` (path `reason`) on every change.
- **Notice:**
  - the end is start + 1 month, including 31 Jan → 28 Feb and 29 Feb in a leap year;
  - the feedback id is kept;
  - an invalid start date is rejected;
  - **lifting, terminating and withdrawing clear `noticeEndsOn`**;
  - `currentNotice` gives the running notice.
- **Read-only:** `updateDetails` and every transition on a final-status intern → `intern_read_only`; `updateDetails` on an active one works and moves `updatedAt`.
- **History:** events accumulate in order, and earlier ones are unchanged (the same objects).
- **Mutations** (on a copy, restored with `cp`): allowing active → terminated; not clearing `noticeEndsOn` on lift; dropping the reason check; letting `updateDetails` touch a final intern; notice ending +30 days instead of +1 month. Each must fail a test.

### Out of scope
- **The repository, API and UI:** 7.3 adds interns manually, 7.6 changes statuses.
- **The colour code:** it's set by submitted feedback (Phase 9, "no reset to none").
- **Airtable re-import rules** (Phase 8).

### Steps
1. The error codes, ids, details validation and onboarding, test-first.
2. The state machine and the named transitions, with the generated transition tests.
3. Run `pnpm check`, run the mutations, and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0, and every one of the 25 transition pairs (plus onboarding) is asserted.
- The mutations above each fail a test.
