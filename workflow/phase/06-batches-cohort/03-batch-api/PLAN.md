# 6.3 Batch API — Plan

**Phase:** 6 — Batches (cohort)
**Status:** Done

## Goal
CRUD plus assignment endpoints and authorization (admin can do everything; PM can assign mentors)

## Done when
- **Endpoints** to create, list, view and archive batches, change a batch's PM, and assign and unassign mentors, built on 6.2's domain and 6.1's tables.
- **Authorization:**
  - admins can do everything;
  - **a batch's current PM can assign and unassign that batch's mentors**, and nothing else;
  - everyone else gets 403.
- **The API's rules show up as problem codes:** 6.2's four, plus `batch_name_taken`, and the role-removal rule (decision 2).
- API integration tests pass (Testcontainers, the real app), and `pnpm check` passes.

## Endpoints
| Method and path | Who | Body → response |
|---|---|---|
| `GET /batches` | admin (decision 1) | → `BatchSummary[]`: active batches first, then by start date (newest first), then name |
| `POST /batches` | admin | `{ name, startDate, endDate, programManagerId }` → **201** `BatchDetail`, with `Location` |
| `GET /batches/:id` | admin (decision 1) | → `BatchDetail` |
| `POST /batches/:id/archive` | admin | → `BatchDetail`. Idempotent. |
| `PUT /batches/:id/program-manager` | admin | `{ userId }` → `BatchDetail`. **Replaces the PM** (6.2): idempotent for the same person. |
| `POST /batches/:id/mentors` | admin, or **the batch's current PM** | `{ userId }` → `BatchDetail`. Idempotent. |
| `DELETE /batches/:id/mentors/:userId` | admin, or **the batch's current PM** | → `BatchDetail`. The row stays as history. Idempotent. |

- **Shapes** (in `packages/contracts/src/batch.ts`):
  - **`BatchSummary`** = `{ id, name, startDate, endDate, isArchived, programManager: { id, name, avatarUrl }, mentorCount }`. That's what the design's batch card needs now; intern counts come in Phase 7.
  - **`BatchDetail`** = the summary + `members: [{ id, user: { id, name, avatarUrl, isActive }, role, assignedAt, unassignedAt }]`, current and past, for 6.5's "current and past members".
- **Validation:** `CreateBatchRequest` matches the domain (name 1–100, ISO dates, end after start), so the web form (6.5) can check it first, as 5.2 does.
- **Errors:**
  - an unknown batch or user → 404;
  - the domain's rules → 409 with their codes;
  - a duplicate name → **409 `batch_name_taken`** (from `batches_name_unique`).

## Decisions needed

### (1) Who can read batches in this task
6.4 is "every batch-scoped query is filtered to the viewer's current assignments, and admins see all".

| Option | What it means |
|---|---|
| **A. Admin-only reads here; 6.4 opens them to members** *(recommended)* | Each task does one thing. 6.3 is CRUD and assignment; 6.4 adds the scope: a mentor or PM sees only their current batches, and someone else's batch is a 404. The PM's mentor endpoints don't need reads: they check the batch's current PM directly. |
| B. Scoped reads now | 6.4 is then left with only the reusable scope for later phases (interns, feedback). |

### (2) Removing a global role from someone with batch assignments (from 6.2)
When an admin (5.3) removes Grace's **Mentor** role while she's a current mentor of a batch:

| Option | What it means |
|---|---|
| **A. Refuse until they're unassigned** *(recommended)* | 409 **`role_in_use`**: "Grace Hopper is a mentor of Batch 1. Unassign them there first." For the **Programme manager** role: "…assign another PM to Batch 1 first". Nothing changes silently, and the data stays consistent ("a member holds the matching role" is always true). 5.3's Callout already shows the message. |
| B. End those assignments automatically | One click, but the admin isn't told that batches lost a mentor. **For a PM it can't work:** a batch must always have one (6.2). |
| C. Leave the assignments | Then a batch's "current mentor" may not be a Mentor, and every later rule has to check both. |

- **Implementation (A):** identity's `setUserRoles` gets a port, `RoleAssignments` ("which batches have this user in this role?"). Cohort's infrastructure implements it, and `main.ts` wires it. So identity doesn't import cohort.
- **Deactivating a user doesn't touch their assignments.** They can't sign in. 6.5 shows them as "Inactive" in the members list, and the admin can unassign them or replace the PM.

### (3) Concurrency
- **Batch changes run in one transaction under the same advisory lock as user management** (3.8's "user-admin" lock, renamed `people-admin`).
- **That makes the decision-2 check and assignment race-free:** "Grace loses Mentor" and "Grace is assigned as mentor" can't interleave. Changes are rare, so one lock costs nothing.
- **The partial unique indexes from 6.1 remain the final guard.**

## Plan

### Contracts
- `batch.ts`:
  - `CreateBatchRequest`, `AssignUserRequest` (`{ userId }`), `BatchSummary`, `BatchMemberView` and `BatchDetail`;
  - tests in the style of `admin-user.test.ts`.
- `problem.ts`: `batch_name_taken` and `role_in_use`.

### API, cohort module
- **`application/batch-repository.ts`:** `findById`, `save` (inserts the batch or updates its columns; inserts new member rows and updates ended ones; throws `batch_name_taken`).
- **`application/batch-queries.ts`:** read models `listSummaries()` and `detail(id)`. They're plain joins to `users` for names and avatars, kept apart from the aggregate, which has only ids.
- **`application/manage-batches.ts`:** use cases `createBatch`, `archiveBatch`, `setProgramManager`, `assignMentor` and `unassignMentor`.
  - Each loads the batch and the `Candidate` (from identity's `UserRepository`, given as a port), runs the domain, and saves if it changed.
  - It runs inside the batch transaction.
  - **The "current PM may manage mentors" check lives here,** using the loaded batch.
- **`infrastructure/drizzle-batch-repository.ts`, `drizzle-batch-queries.ts`, `drizzle-batch-admin.ts`** (the transaction with the shared lock), and `drizzle-role-assignments.ts` (decision 2's port).
- **`http/batches.routes.ts`:**
  - `authenticate`, then `requireRole('admin')` per route, except the two mentor routes, which accept an admin or defer to the use case's PM check;
  - logs carry the actor's and the target's ids only;
  - `http/batch-views.ts` maps to the contracts.
- **`app.ts` / `main.ts`:** mount `/batches`; build the deps.

### API, identity module
- **`setUserRoles`** checks `RoleAssignments` for each removed `mentor` or `program_manager` role, inside its transaction, and throws `role_in_use` with the batch names.
- **Rename the lock** `userAdminLock` → `peopleAdminLock` (`'feedback-portal:people-admin'`); it's shared by both modules.

### Tests (integration, `batches.routes.int.test.ts`, the real app on Testcontainers)
- **Access:**
  - every route gives 401 signed out;
  - mentors get 403 on every route;
  - **a PM gets 403 on everything except the mentor routes of a batch they currently run**, and 403 on another PM's batch, or after being replaced.
- **Create:**
  - 201 with the PM as the only member, plus `Location`;
  - every invalid field together (400);
  - a duplicate name in a different case → 409 `batch_name_taken`;
  - a PM without the role → 409 `member_role_mismatch`; an inactive PM → `member_inactive`; an unknown PM → 404.
- **List and detail:**
  - the order;
  - the summary's PM and mentor count;
  - the detail's current and past members, with names;
  - 404 for an unknown id.
- **PM:**
  - replacing ends the old PM's row and adds the new one;
  - the same person again gives 200 with no change.
- **Mentors:**
  - assign (by an admin, and by the batch's PM);
  - assigning again is a no-op;
  - someone without the Mentor role → 409;
  - unassign keeps the history row;
  - unassigning someone not assigned → 200, no change;
  - the PM can't unassign themselves through this route (it's mentors only).
- **Archive:** archives, is idempotent, and **every change afterwards → 409 `batch_archived`**.
- **Decision 2** (in `users.routes.int.test.ts`):
  - removing Mentor from a current mentor → 409 `role_in_use`, naming the batch, and the roles unchanged;
  - after they're unassigned → 200;
  - removing Programme manager from a current PM → 409;
  - deactivating them still works.
- **Concurrency:** while the lock is held (as 3.8 tests it), a batch change waits.

### Out of scope
- **Scoped reads for mentors and PMs** (6.4, decision 1).
- **Editing a batch's name or dates, unarchiving, and deleting.** None of these is in ROADMAP 6.x or the design.
- **The UI** (6.5 and 6.6).

### Steps
1. Contracts and error codes.
2. The repository, queries and transaction, with repository tests (they round-trip a batch with history).
3. The use cases and routes, with route tests.
4. Decision 2 in identity, with tests.
5. Run `pnpm check`, run the checks below, and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- **Mutations** (on copies, restored with `cp`):
  - the PM check removed (any PM can manage any batch);
  - `requireRole('admin')` removed from create;
  - the `role_in_use` check removed;
  - `batch_name_taken` not mapped.

  Each must fail a test.
- **Compose:** rebuilt. With a test admin's session and `curl` against `/api/batches`: create, assign a mentor, try to remove that mentor's role (409), unassign, archive. The test rows are deleted afterwards.
