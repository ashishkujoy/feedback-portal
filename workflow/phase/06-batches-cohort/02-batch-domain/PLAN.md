# 6.2 Batch domain — Plan

**Phase:** 6 — Batches (cohort)
**Status:** Done

## Goal
Create or archive a batch, assign or unassign members, one PM per batch, and a user must hold the matching global role

## Done when
- **A pure `Batch` aggregate** in `modules/cohort/domain`, in the style of identity's `User`: functions that return a new value (or the same object when nothing changes), with time, ids and the actor passed in, and no database.
- **It enforces PRODUCT's rules:**
  - a batch has **exactly one PM** (PRODUCT §7 row 1), and one person can be PM of several batches;
  - **a member must hold the matching global role:** a batch mentor must have the Mentor role, and a batch PM the Programme manager role;
  - **an archived batch is read-only** (DATA_MODEL).
- **Unit tests pass** (Vitest, no database), and `pnpm check` passes.

## The model
- **`Batch`** = `{ id, name, startDate, endDate, isArchived, createdBy, createdAt, updatedAt, members }`.
  - Dates are `'YYYY-MM-DD'` strings, as 6.1 reads them.
  - **`members` is the assignment history** (the `batch_members` rows), owned by the batch, as `User` owns its role grants. A member is `{ id, userId, role, assignedBy, assignedAt, unassignedAt, unassignedBy }`.
  - The "current" ones are those with `unassignedAt === null`.
- **The person being assigned is given as a `Candidate`** = `{ id, roles, isActive }`. That's cohort's own view of a user, so the domain doesn't depend on identity's `User`. 6.3 builds it from the user repository.
- **Errors** are `AppError`s, as in identity: `validationFailed` with field issues for bad input, and `conflict` with a code for broken rules.

## Operations
| Function | Rules |
|---|---|
| `createBatch({ id, name, startDate, endDate, programManager, createdBy, memberId, now })` | **Name:** trimmed, 1–100 characters. **Dates:** valid ISO dates, end after start. **A batch starts with its PM** (design A9 asks for one; PRODUCT says exactly one), checked as for `assignMember`. Invalid fields come back together as `validation_failed`. |
| `assignMember(batch, { candidate, role, memberId, by, now })` | **Rejects:** an archived batch (`batch_archived`); a candidate without the matching global role (`member_role_mismatch`); an inactive candidate (`member_inactive`). **No-op** if they're already a current member in that role. **For `program_manager`, it replaces the current PM:** see decision 1. |
| `unassignMember(batch, { userId, role, by, now })` | Rejects an archived batch. Sets `unassignedAt`/`unassignedBy` on the current assignment; **a no-op** if there isn't one. **Rejects unassigning the PM** (`batch_requires_pm`): a PM is changed by assigning a new one (decision 1). |
| `archiveBatch(batch, { now })` | Sets `isArchived`; a no-op if already archived. **Members stay as they are,** so the history shows who was on the batch when it ended. |
| `currentMembers(batch)`, `currentProgramManager(batch)`, `isCurrentMember(batch, userId)` | Read helpers for 6.3 and 6.4 |

## Decisions needed

### (1) Changing a batch's PM
PRODUCT says each batch has **exactly one** PM. The database (6.1) only stops a *second* one.

| Option | What it means |
|---|---|
| **A. Assigning a new PM replaces the current one** *(recommended)* | One step: the old PM's assignment ends (`unassigned_by`/`at` = the actor/now) and the new one starts, so there's always exactly one. **Unassigning the PM on its own is rejected** (`batch_requires_pm`). Assigning the current PM again is a no-op. |
| B. Unassign, then assign | Two steps, with a moment (or longer) with no PM, which PRODUCT doesn't allow. |

### (2) Archiving
| Option | What it means |
|---|---|
| **A. One way: archive only** *(recommended)* | ROADMAP and PRODUCT mention archiving, never undoing it. An archived batch rejects member changes; later phases make its interns and feedback read-only too. **Unarchiving can be added later** if it's needed. |
| B. Archive and unarchive | More flexible, but there's no use for it yet, and every read-only rule then needs to handle a batch coming back. |

### (3) New error codes (contracts `ErrorCode`)
`batch_archived`, `member_role_mismatch`, `member_inactive` and `batch_requires_pm`. The web app (6.5/6.6) switches on these to show the right message. **`batch_name_taken`** comes with the repository in 6.3, like `email_taken`.

## Out of scope
- **Editing a batch's name or dates.** It isn't in ROADMAP 6.x or the design; it can come later.
- **Authorization:** admins do everything, and a PM can assign mentors to their batch. That's 6.3 (API).
- **What happens to a user's batch assignments when they're deactivated or lose a role in 5.3.** Their assignments stay; **6.4's visibility check only counts active users, so a deactivated person sees nothing.** Whether removing someone's Mentor role should end their batch assignments is a question for 6.3; I'll raise it in that plan.
- **The repository and migrations:** 6.3, on 6.1's tables.

## Plan
- `modules/cohort/domain/batch.ts` (the aggregate and operations), `batch-id.ts` and `batch-member-id.ts` (branded uuids, like `UserId`), and `candidate.ts` (the type).
- `packages/contracts/src/problem.ts`: the four codes.
- No API or web changes.

### Tests (`batch.test.ts`, pure)
- **`createBatch`:**
  - trims the name;
  - starts with the PM as the only current member;
  - reports every invalid field together (an empty name, a bad date, end not after start);
  - rejects a PM without the Programme manager role, or an inactive one.
- **`assignMember`:**
  - adds a mentor;
  - assigning the same mentor again is a no-op (the same object back);
  - **rejects a mentor without the Mentor role, and a PM without the Programme manager role**;
  - rejects an inactive candidate and an archived batch;
  - **a new PM replaces the old one:** the old assignment ends with the actor and time, the new one starts, and there's exactly one current PM;
  - assigning the current PM again is a no-op;
  - **one person can be mentor and PM of the same batch**;
  - someone unassigned earlier can be assigned again, as a new history row.
- **`unassignMember`:**
  - ends a mentor's assignment (records who and when, and keeps the row);
  - a no-op for someone not currently assigned;
  - **rejects unassigning the PM**;
  - rejects an archived batch.
- **`archiveBatch`:** archives, keeps members, and is a no-op the second time.
- **The read helpers:** current members, the current PM, and `isCurrentMember` (by user, any role).

### Steps
1. The error codes, ids and `Candidate`.
2. `batch.ts`, test-first.
3. Run `pnpm check` and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- **Mutations** (on copies, restored with `cp`): no role check, no archived check, a PM assignment that doesn't end the old one, allowing the PM to be unassigned, and a non-idempotent assign. Each must fail a test.
