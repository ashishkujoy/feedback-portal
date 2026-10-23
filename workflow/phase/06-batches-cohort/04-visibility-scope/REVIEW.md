# 6.4 Visibility scope — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/cohort/infrastructure/batch-visibility.ts` | **The rule, defined once:** `visibleBatchCondition(viewer, batchIdColumn)` is `true` for admins, otherwise `EXISTS (a current assignment of the viewer to that batch, in any role)`. **Any batch-scoped query adds it to its `WHERE`,** passing its own batch-id column; Phase 7's interns will pass `interns.batchId`. It reads `batch_members` through an alias (`visible_via`), so it also works inside queries on `batch_members`. **`createBatchScope`** implements `canSee` with the same condition. |
| `cohort/application/batch-scope.ts` | `Viewer` (`{ id, isAdmin }`) and the `BatchScope` port |
| `cohort/application/batch-queries.ts`, `infrastructure/drizzle-batch-queries.ts` | `listSummaries(viewer)` and `detail(id, viewer)` apply the condition. An invisible batch's detail is `null`, which becomes 404. The list's member query covers only the listed batches. |
| `cohort/application/manage-batches.ts`, `batch-admin.ts`, `infrastructure/drizzle-batch-admin.ts` | `listBatches` and `getBatch` take the viewer. **The mentor routes check visibility first (404), then "admin or this batch's current PM" (403)** (decision 2). The transaction scope gains `scope`. `Actor` is now the same type as `Viewer`. |
| `cohort/http/batches.routes.ts` | `GET /batches` and `GET /batches/:id` are open to any signed-in user, scoped. Everything else is unchanged. |
| `README.md` | The batches section describes the visibility rule |

## How to verify
```sh
pnpm check     # contracts 58 + web 91 + api 389
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 58 + 91 + **389** (+7 net: 5 condition tests, plus the visibility route tests, less the read cases removed from the 403 access table). `pnpm format:check` is clean. |
| **The condition** (5, against Postgres) | **An admin sees every batch** (and not a missing one). **A PM sees the batch they run, not another PM's.** **A mentor goes no → yes on assignment → no on unassignment → yes on re-assignment, and never sees the other batch.** A replaced PM loses the batch and the new one gains it. **It works in a query over `batch_members` itself.** |
| **Routes** | **The ROADMAP check: a mentor lists only "Mine", reads it, and gets 404 "Batch not found" for "Other".** A PM lists the batches they run; an admin lists all. **An unassigned mentor's list is empty and the detail is 404; a replaced PM's list is empty.** **An archived batch stays visible to its members** (decision 1). **A mentor on a batch gets 403 on its mentor routes** (decision 2). A PM on another PM's batch now gets **404** (6.3 gave 403), as does a PM after being replaced. Someone with no assignments gets `[]`. |
| **Updated 6.3 tests** | **Reads left the "403 for a mentor/PM" access table:** they're scoped now. The two PM-on-the-wrong-batch tests now expect 404. |
| **Mutations** (on copies, restored with `cp`) | **5, all caught:** no `unassigned_at IS NULL` (4 tests fail); no `user_id` match (10); always visible (10); the mentor routes skipping visibility (2); the list unscoped (4). |
| **Compose** (rebuilt; a test admin and test mentor with sessions, a test PM, two test batches; **all deleted afterwards**) | As the mentor, assigned to "Check A" only: list → `["Check A"]`; A → 200; **B → 404**; assigning on A → **403**. After the admin unassigns them: list → `[]`, A → **404**. The admin's list → both. |

## Decisions & trade-offs
- **Both decisions taken as recommended:** archived batches stay visible to their members, and 404 for "can't see" but 403 for "can see but can't change".
- **The condition is SQL, not a list of ids loaded first.** Later queries (interns, feedback) filter in the database in one round trip, however many batches there are.
- **"Current assignment" is the whole rule.** `authenticate` already turns away inactive users, and 6.3's `role_in_use` keeps assignments and global roles in step, so neither is checked again.
- **Admin-only changes (create, archive, change the PM) still answer 403 to non-admins without looking up the batch.** Who may do those doesn't depend on the batch, so there's nothing to hide.

## Deviations from plan
- **The first version of the condition put the alias in raw `sql` as `from "visible_via"`,** without the table name, which is invalid. Every non-admin read gave a 500, and the new route tests caught it at once. The `FROM` clause now names the table explicitly (`"batch_members" as "visible_via"`). I printed the generated SQL to confirm it, using a temporary script that I've deleted.

## Not done / follow-ups
- **Phases 7 and 8:** interns and feedback queries must add `visibleBatchCondition(viewer, <their batch_id column>)`. Their plans will reference it.
- **6.5:** the batches page, which every role can now load.
