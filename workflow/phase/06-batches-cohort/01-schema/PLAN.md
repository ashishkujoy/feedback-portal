# 6.1 Schema — Plan

**Phase:** 6 — Batches (cohort)
**Status:** Done

## Goal
`batches` and `batch_members` tables, with partial unique indexes

## Done when
- **Migration `0002_cohort` applies** to the test database and to Compose (the `migrate` service).
- **The database rejects a second current PM for a batch.** It also rejects duplicate current assignments, as DATA_MODEL says.
- Schema tests cover these. `pnpm check` passes.

## What DATA_MODEL says (§3 cohort)
- **`batches`:** `id`, a unique `name`, `start_date`, `end_date` (about start + 18 months), `is_archived` (default false; an archived batch is read-only), `created_by` → users, and `created_at`/`updated_at`.
- **`batch_members`** is the assignment history. Rows are never deleted: unassigning sets `unassigned_at`. Columns: `id`, `batch_id` → batches, `user_id` → users, `role` (`batch_member_role`: `mentor`, `program_manager`), `assigned_by` → users, `assigned_at`, `unassigned_at` (null means current) and `unassigned_by` → users.
- **Constraints:**
  - partial unique (`batch_id`) where `role = 'program_manager' AND unassigned_at IS NULL`: **one PM per batch**;
  - partial unique (`batch_id`, `user_id`, `role`) where `unassigned_at IS NULL`: no duplicate current assignments;
  - no limit on how many batches a user is in, so **one PM can run several batches**.

## Decisions needed

### (1) Extra checks DATA_MODEL doesn't list
| Check | Why |
|---|---|
| **`batches.end_date > start_date`** | A batch that ends before it starts is always a bug. |
| **`unassigned_at` and `unassigned_by` are both null or both set** | Every unassignment records who did it. |
| **`unassigned_at >= assigned_at`** | History can't run backwards. |

**Recommended: add all three as `CHECK` constraints.** The domain (6.2) checks the same things and gives friendly errors; these are the safety net, like 3.1's unique email. The alternative is the domain only.

### (2) Batch names that differ only in case
**Recommended: `citext`**, as for `users.email`, so "Batch 1" and "batch 1" can't both exist. The alternative is plain `text`, where only exact duplicates are rejected.

### (3) What happens on delete
- **Recommended: no cascades.** Batches are archived, not deleted, and users are deactivated, not deleted. Plain foreign keys (`NO ACTION`) make an accidental delete of either fail instead of erasing history.
- That differs from identity, where deleting a user cascades to their roles and sessions. Those are owned by the user; batch history isn't.

### (4) An index for "my batches"
6.4 filters every batch-scoped query to the viewer's current assignments, by `user_id`.
- **Recommended: a partial index on `batch_members (user_id) WHERE unassigned_at IS NULL`.** It's small, and it's what that lookup needs.
- The two partial uniques already cover lookups by `batch_id`.

## Plan
- **`packages/contracts/src/batch-member-role.ts`:** a `batchMemberRoles` tuple, like `roles`, for the Postgres enum.
- **`apps/api/src/modules/cohort/infrastructure/schema.ts`** (the cohort context's first file, in the same style as identity):
  - **`batchMemberRoleEnum`** = `pgEnum('batch_member_role', batchMemberRoles)`.
  - **`batches`:**
    - `id` (uuid, default `uuidv7()`), `name` (citext, unique), `startDate` / `endDate` (`date`, as strings), `isArchived` (default false), `createdBy` → users, and `createdAt` / `updatedAt`;
    - the check `batches_dates_check`.
  - **`batchMembers`:**
    - `id`, `batchId` → batches, `userId` → users, `role`, `assignedBy` → users, `assignedAt` (default now), `unassignedAt`, and `unassignedBy` → users;
    - the checks `batch_members_unassigned_check` and `batch_members_unassigned_after_check`;
    - the partial uniques **`batch_members_one_pm_unique`** and **`batch_members_current_unique`**, and the index `batch_members_current_user_index`.
- **The migration:** `pnpm --filter @feedback-portal/api db:generate --name cohort` → `drizzle/0002_cohort.sql`. I'll read the SQL to check the partial `WHERE` clauses and checks are exactly as intended.
- **`drizzle.config.ts` already includes `./src/modules/*/infrastructure/schema.ts`,** so nothing changes there.
- **`pg-error.ts`:** add `checkViolation: '23514'` to `pgErrorCodes`, for the tests now and the repository in 6.2/6.3.

### Tests (`cohort/infrastructure/schema.int.test.ts`, Testcontainers)
- **Batches:**
  - defaults: a uuid v7 id, `is_archived` false, timestamps;
  - the name is unique ignoring case (23505);
  - an end date on or before the start is rejected (23514);
  - an unknown `created_by` is rejected (23503).
- **One PM per batch:**
  - **a second current PM on the same batch is rejected (23505, `batch_members_one_pm_unique`);**
  - once the first is unassigned, a new PM is accepted;
  - **the same person can be the current PM of two batches.**
- **Current assignments:**
  - the same mentor twice on a batch is rejected (`batch_members_current_unique`);
  - after unassigning, they can be assigned again, so history keeps both rows;
  - the same person as both mentor and PM of one batch is accepted (PRODUCT: a PM can also be a mentor).
- **Checks:**
  - `unassigned_at` without `unassigned_by`, or the reverse, is rejected;
  - `unassigned_at` before `assigned_at` is rejected.
- **Deletes:** deleting a batch that has members, or a user who created a batch, is rejected (23503).
- **The role enum** rejects `admin` as a batch role (22P02).

### Out of scope
- **The batch domain and its rules** (6.2): "a member must hold the matching global role" and "an archived batch is read-only" can't be expressed in the database, and are enforced there.
- **`interns` and the rest of the schema** (Phase 7 onwards).

### Steps
1. The contracts tuple and the schema. Generate and read the migration.
2. Schema tests.
3. Run `pnpm check`, apply to Compose (`docker compose up -d --build --wait`, then check `\d batch_members` in psql), and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0. The migration's SQL has the partial indexes and checks as above.
- **Mutation:** the one-PM index without its `WHERE` clause (on a copy of the generated SQL, restored with `cp`) must fail "accepted after the first is unassigned"; without the `role` condition, it must fail "mentor and PM of one batch".
- **Compose:** `migrate` applies `0002_cohort` and exits 0, and psql shows both tables, their indexes and checks.
