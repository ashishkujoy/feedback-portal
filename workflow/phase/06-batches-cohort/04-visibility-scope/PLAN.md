# 6.4 Visibility scope — Plan

**Phase:** 6 — Batches (cohort)
**Status:** Done

## Goal
Every batch-scoped query is filtered to the viewer's current assignments, and admins see all

## Done when
- **Mentors and PMs can read batches, but only the ones they're currently assigned to** (PRODUCT §7 row 7). Admins see every batch.
- **A batch someone can't see answers 404,** as if it didn't exist. That includes 6.3's mentor routes for a PM who isn't on that batch, which give 403 today.
- **One reusable scope** that later batch-scoped queries (interns in Phase 7, feedback in Phase 8) apply the same way, so "who can see this batch" is defined once.
- **A test shows a mentor can't see a batch they're not assigned to** (ROADMAP). `pnpm check` passes.

## The rule
- **Visible** = the viewer is an admin, **or** has a current assignment to the batch in any role (`batch_members.unassigned_at IS NULL`).
- **"Current" is what counts:**
  - a mentor who has been unassigned, or a PM who has been replaced, loses access at once;
  - assigning them again gives it back.
- **Signed-in users are always active** (`authenticate` rejects inactive ones), and 6.3's `role_in_use` keeps "assigned as mentor" and "holds Mentor" in step. So the rule needs nothing else.

## Decisions needed

### (1) Archived batches
6.2 keeps an archived batch's members current, so its history shows who was on it.

| Option | What it means |
|---|---|
| **A. Members still see their archived batches, read-only** *(recommended)* | PRODUCT §144 says history "stays visible to the batch's current mentors and PM", and archiving doesn't unassign anyone. The list shows them after the active ones, as it does for admins. |
| B. Hide archived batches from non-admins | A tidier list, but a mentor loses access to past feedback they wrote. |

### (2) What a mentor can do on a batch they can see
- **They can see it; they can't change it.**
  - The mentor routes stay "admin, or this batch's current PM".
  - A mentor on the batch who tries gets **403**: the batch exists for them, and they're not allowed.
  - **Someone not on the batch gets 404.**
- That's the usual "404 if you can't see it, 403 if you can see it but can't do it". **Recommended**, with no alternative worth listing.

## Plan
- **`cohort/application/batch-scope.ts`:**
  - `Viewer` = `{ id, isAdmin }`;
  - the port `BatchScope` = `{ canSee(viewer, batchId): Promise<boolean> }`, which the use cases call for single-batch actions.
- **`cohort/infrastructure/batch-visibility.ts`:**
  - `visibleBatchCondition(viewer, batchIdColumn)` returns a Drizzle SQL condition: `true` for admins, otherwise `EXISTS (current assignment of viewer to <column>)`. **Any query over a batch-scoped table adds it to its `WHERE`;** Phase 7's interns will use `interns.batch_id`.
  - `createBatchScope(db)` implements `canSee` with the same condition, so there's one definition.
- **`BatchQueries`:** `listSummaries(viewer)` and `detail(id, viewer)` apply the condition, and an invisible batch's detail is `null`, which becomes 404.
- **`manage-batches.ts`:**
  - `listBatches` and `getBatch` take the viewer;
  - **`assignMentor` / `unassignMentor` check visibility first (404), then the PM rule (403)**;
  - the admin-only use cases are unchanged (the route already requires admin).
- **`batches.routes.ts`:** `GET /batches` and `GET /batches/:id` are open to any signed-in user, scoped. The other routes are unchanged.
- **README:** the batches section's "Reads are admin-only until 6.4" becomes the rule above.

### Tests
- **`batch-visibility` (integration, against Postgres):**
  - the condition admits an admin to every batch;
  - it admits a mentor only to their current batch;
  - **it no longer admits them after they're unassigned, or a PM after they're replaced, and it admits them again once re-assigned;**
  - it ignores assignments to other batches;
  - it covers both roles.
- **Routes:**
  - **A mentor lists only their batch, and gets 404 for a batch they're not on** (the ROADMAP check);
  - a PM sees the batches they run;
  - an admin sees all;
  - **an unassigned mentor's list is empty, and the detail is 404**;
  - **an archived batch stays visible to its members** (decision 1);
  - **a mentor on the batch gets 403 on the mentor routes; someone not on it gets 404** (decision 2);
  - a PM on another PM's batch now gets 404, where 6.3 gave 403;
  - a user with no assignments gets an empty list.
- **Mutations** (on copies, restored with `cp`): the condition without `unassigned_at IS NULL`, without the `user_id` match, or always true for everyone; and the mentor routes skipping the visibility check. Each must fail a test.

### Out of scope
- **The web UI** (6.5): the batches page uses `GET /batches`, which now works for everyone.
- **Interns and feedback scoping** (Phases 7 and 8). They'll use `visibleBatchCondition`, and their plans will point at it.

### Steps
1. The condition, the `BatchScope` adapter, and their tests.
2. Scoped queries, use cases and routes, with tests (6.3's access tests updated for the new 404s).
3. README. Run `pnpm check`, check in Compose with `curl` as a test mentor (sees their batch, 404 for another), and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- **Compose:** as a test mentor assigned to one of two test batches, `GET /api/batches` lists one; the other's detail is 404. After an admin unassigns them, the list is empty. The test rows are deleted afterwards.
