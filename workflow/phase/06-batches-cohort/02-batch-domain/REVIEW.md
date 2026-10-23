# 6.2 Batch domain — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/cohort/domain/batch.ts` | **The `Batch` aggregate**, pure, in identity's style. Every operation returns a new `Batch`, or the same object when nothing changes; time, ids and the actor are passed in. `members` is the assignment history (the `batch_members` rows), owned by the batch. **`createBatch`:** name trimmed (1–100), valid ISO dates with the end after the start (every invalid field reported together), and **it starts with its PM**. **`assignMember`:** rejects an archived batch, a candidate without the matching global role, and an inactive one; **a no-op if already assigned in that role**; **assigning a PM replaces the current one in the same step** (decision 1A). **`unassignMember`:** ends the assignment, keeping the row; a no-op if there's none; **rejects unassigning the PM** (`batch_requires_pm`). **`archiveBatch`:** one-way (decision 2A), keeps members, idempotent. Read helpers: `currentMembers`, `currentProgramManager` and `isCurrentMember`. |
| `domain/batch-id.ts`, `batch-member-id.ts` | Branded uuids, like `UserId`. A `BatchMemberId` identifies one assignment, so re-assigning someone makes a new one. |
| `domain/candidate.ts` | **`Candidate` = `{ id, roles, isActive }`:** cohort's view of the person being assigned, so the domain doesn't depend on identity's `User`. Only `UserId` is shared. |
| `domain/batch.test.ts` | 19 unit tests, with no database |
| `packages/contracts/src/problem.ts` (+ test) | Error codes `batch_archived`, `member_role_mismatch`, `member_inactive` and `batch_requires_pm` (decision 3) |

## How to verify
```sh
pnpm check     # contracts 54 + web 91 + api 337
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 54 + 91 + **337** (+19). `pnpm format:check` is clean. |
| `createBatch` (5) | Trims the name, and the PM is the only current member (assigned by the creator at creation time). An empty name, 30 February and "soon" are reported together (`name`, `startDate`, `endDate`). A name over 100 characters. An end on or before the start. A PM without the Programme manager role → `member_role_mismatch`; an inactive one → `member_inactive`. |
| `assignMember` (8) | Adds a mentor (records who and when; `updatedAt` moves). **Repeating an assignment returns the same object.** **No Mentor role → `member_role_mismatch`** (even for an admin and PM); no Programme manager role for a PM → the same. Inactive → `member_inactive`. Archived → `batch_archived`. **A new PM replaces the old one:** the old assignment ends with the actor and time, and there's exactly one current PM. **One person can be mentor and PM of the same batch.** Re-assigning someone adds a second history row with its own id. |
| `unassignMember` (4) | Ends a mentor's assignment, keeping the row. A no-op for someone not assigned, or not in that role. **Unassigning the PM → `batch_requires_pm`.** Archived → `batch_archived`. |
| `archiveBatch`, `isCurrentMember` (2) | Archives, keeps current members, and is a no-op the second time. A current member in any role counts; an unassigned one doesn't. |
| **Mutations** (on a copy, restored with `cp`) | **9, all caught:** no role check; the role mapping swapped; no archived check; a PM assignment that doesn't end the old one; the PM can be unassigned; a non-idempotent assign; no inactive check; an end date equal to the start; `createBatch` skipping the PM check. |

## Decisions & trade-offs
- **All three decisions taken as recommended:** a new PM replaces the old one, archiving is one-way, and the four error codes.
- **The checks run in this order:** archived, then the role, then active, so the error matches the most basic problem. **The no-op is checked after them:** assigning someone already assigned, but no longer eligible, still reports why rather than silently succeeding.
- **Archiving keeps current members current.** That's what "who was on the batch when it ended" needs. 6.4 decides whether archived batches stay visible to their members; PRODUCT §7 row 7 suggests yes (they're still assigned).
- **Dates are compared as `YYYY-MM-DD` strings,** which order correctly, with no time zone involved.

## Deviations from plan
- None.

## Not done / follow-ups
- **6.3 (API and repository):** `batch_name_taken`, authorization (admins do everything; a PM assigns mentors to their own batch), and building a `Candidate` from the user repository.
- **For the 6.3 plan:** when 5.3 removes someone's Mentor or Programme manager role, should their current batch assignments in that role end? The domain allows either; I'll put it to you there.
