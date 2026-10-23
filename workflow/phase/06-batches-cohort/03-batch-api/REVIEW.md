# 6.3 Batch API — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/src/batch.ts` (+ test) | `CreateBatchRequest` (the domain's limits; the end-after-start rule runs only once both dates are valid), `AssignUserRequest`, `BatchSummary` (the PM and mentor count), `BatchMemberView` and `BatchDetail` (members current and past). Error codes `batch_name_taken` and `role_in_use`. |
| `apps/api/src/modules/cohort/http/batches.routes.ts`, `batch-views.ts` | **The seven endpoints** in the plan. `authenticate`, then `requireRole('admin')` on every route except the two mentor routes (`admin` or `program_manager`, with the batch's own PM checked by the use case). Logs carry the actor's, batch's and user's ids only. |
| `cohort/application/manage-batches.ts` | The use cases. Each loads the batch (404 "Batch not found") and the `Candidate` (404 "User not found"), runs 6.2's domain, saves if it changed, and reads the detail back, **all in one transaction**. **`ensureCanManageMentors`:** an admin, or the batch's *current* PM, else 403. |
| `cohort/application/batch-repository.ts`, `batch-queries.ts`, `candidates.ts`, `batch-admin.ts` | Ports: the aggregate's repository, **read models with names** (kept apart from the aggregate, which holds ids), the candidate lookup, and the transaction scope |
| `cohort/infrastructure/drizzle-batch-repository.ts` | Upserts the batch (name, archived, updated). Inserts new member rows and **records ended ones** (`unassigned_at`/`_by` from `excluded`). `batches_name_unique` → **`batch_name_taken`**. |
| `cohort/infrastructure/drizzle-batch-queries.ts` | The list: active first, then newest start date, then name, with each batch's current members fetched in one query. The detail: members in assignment order, with name, avatar and active state. |
| `cohort/infrastructure/drizzle-candidates.ts`, `drizzle-role-assignments.ts`, `drizzle-batch-admin.ts` | A `Candidate` built from identity's user repository; **identity's `RoleAssignments` port** (the names of batches where the user currently holds a role); the transaction under the people-admin lock |
| `identity/application/manage-users.ts`, `role-assignments.ts`, `user-admin.ts`, `infrastructure/drizzle-user-admin.ts` | **Decision 2A:** `setUserRoles` refuses to remove `mentor` or `program_manager` while that role is in use in a batch (409 **`role_in_use`**, naming the batches). **Identity doesn't import cohort:** the port is passed in by `main.ts`. |
| `shared/db/advisory-lock.ts` | **`peopleAdminLock`** (`feedback-portal:people-admin`), replacing 3.8's `userAdminLock`; it's shared by user and batch changes (decision 3) |
| `app.ts`, `main.ts`, `test/app-deps.ts` | Mount `/batches`; wire `manageBatches` and `createRoleAssignments` |
| `README.md` | "API endpoints (batches)" and the `role_in_use` rule |

## How to verify
```sh
pnpm check     # contracts 58 + web 91 + api 382
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 58 (+4) + 91 + **382** (+44). `pnpm format:check` is clean. |
| **Repository and queries** (7) | **A batch round-trips with its whole history:** created, mentor assigned, unassigned, archived, and read back equal to the domain value. Unknown → null. A name taken in another case → `batch_name_taken`. The list order, the PM and mentor counts. The detail's current and past members with names and active state. The `Candidate` lookup. **`RoleAssignments`** names only the batches where the role is *current*, sorted. |
| **Routes** (34) | **401** signed out and **403 for a mentor** on all seven routes; **403 for a PM** on the five admin routes. Create: 201 with `Location` and the PM as the only member; all four invalid fields together (400); a duplicate name in another case → 409 `batch_name_taken`; a PM without the role, inactive, or unknown → 409 / 409 / 404. List order and detail (404 when unknown). **Replacing the PM** ends the old row, and repeating it changes nothing. **Mentors:** assigned and unassigned by an admin (repeats are no-ops; the history row stays); **changed by the batch's own PM; 403 on another PM's batch, and 403 once they're replaced**; someone without the Mentor role → 409; the PM can't be removed through the mentor route; 404 for an unknown batch or user. **Archive:** idempotent, then all three changes → 409 `batch_archived`. **The lock:** a batch change waits while another connection holds the people-admin lock. |
| **`role_in_use`** (3, in `users.routes.int.test.ts`) | Removing Mentor from a current mentor → 409, "Mo Mentor is a mentor of Batch 1. Unassign them there first.", with roles unchanged; after unassigning → 200. Removing Programme manager from a batch's PM → 409 with the PM message. Adding roles and deactivating still work. |
| **Mutations** (on copies, restored with `cp`) | **7, all caught:** the PM check removed; create not admin-only; detail not admin-only; the `role_in_use` check removed; `batch_name_taken` not mapped; ended assignments not saved; archiving not saved. |
| **Compose** (rebuilt; a test admin with a session and a test PM and mentor; **all rows deleted afterwards**, and your account is unchanged) | Through `/api` with `curl`: **create** → 201; **assign the mentor** → 200, mentor count 1; **remove their Mentor role** → 409 `role_in_use` ("Check Mentor is a mentor of Check Batch. Unassign them there first."); **unassign** → 200, count 0, two member rows; **archive** → 200; **assign afterwards** → 409 `batch_archived`; **list** → the batch; **duplicate name in lower case** → 409 `batch_name_taken`. The API logs show the four changes with ids only. |

## Decisions & trade-offs
- **All three decisions taken as recommended:** admin-only reads until 6.4, `role_in_use`, and the shared people-admin lock.
- **A PM gets 403, not 404, for another PM's batch** on the mentor routes. That reveals the batch exists. **6.4 (visibility)** decides whether non-members get 404 everywhere.
- **Responses come from the read model, inside the same transaction,** so they show the committed state with names, and one request means one consistent read.
- **The list loads every batch's current members in one query** and groups them in code. There are tens of batches; there's no pagination, as the design has none.
- **`createUserAdminTransaction` now needs the `RoleAssignments` factory.** That makes forgetting to wire it in `main.ts` a type error rather than a silent gap.

## Deviations from plan
- **Fixed in 6.1's schema test:** two tests mixed the host's clock (`new Date()`) with the database's (`assigned_at`'s default `now()`). The Colima VM's clock had drifted ahead, so "needs both who and when" failed every time with the *other* check's name. Both now use fixed times or the database's clock. This was a test-only problem: the app supplies both times from one clock.
- **Fixed in 6.2's domain:** the end-after-start check also ran when a date was invalid. It only passed before because "soon" happens to sort after "2027-…". It now runs only once both dates are valid, with a new test.
- **No separate repository test file for queries:** the repository, queries, candidates and role assignments are tested together in `drizzle-batch-repository.int.test.ts`.

## Not done / follow-ups
- **6.4:** reads for mentors and PMs (their current batches only), and whether non-members get 404 rather than 403.
- **6.5 / 6.6:** the UI.
