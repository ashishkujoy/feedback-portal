# 8.4 Import commit API — Plan

**Phase:** 8 — Airtable import
**Status:** Done

## Goal
`airtable_imports` table; adds new interns and updates existing ones matched by username; repeatable

## Done when
- **The `airtable_imports` table** (DATA_MODEL), with the `import_status` enum (`pending`, `completed`, `failed`), and its migration.
- **`POST /batches/:batchId/imports`** with the same `{ token, baseId, tableId, view }` as the preview:
  - reads Airtable again, maps (8.2) and compares (8.3);
  - **adds the new interns and updates the matched ones, all or nothing;**
  - skips invalid rows;
  - records the run in `airtable_imports`;
  - answers with what it did (v2 A10-result: "3 added, 1 updated, 2 skipped.").
- **Repeatable:** re-running the same import creates **no duplicates** (the roadmap's "Done when"); the second run adds 0 and updates every matched intern.
- **Same access as the preview:** admins and the batch's PM, not archived; **the token is never stored or logged.**
- API and repository tests pass, and `pnpm check` passes.

## What a run does
1. **Check access** (7.3's check), then **record the run as `pending`** in its own short transaction (v2 A10-importing: "The import shows as pending in the batch's import history until it finishes.").
2. **Read Airtable** (8.1), outside any transaction.
3. **One transaction under a per-batch lock:**
   - re-check access and archive;
   - **compare with the interns as they are now** (8.3's `previewImport`);
   - **add** each new intern with `onboardIntern` (`airtableRecordId`, `airtableFields`, the importer as the actor; their history's first row reads "Imported from Airtable.");
   - **update** each match with a new domain operation, `refreshFromAirtable` (decision 3);
   - **mark the run `completed`** with its counts and the invalid rows.
4. **If anything fails,** nothing is written to interns, and the run is marked **`failed`** with a short reason (v2 A10-failed: "Airtable rate limit reached… Nothing was saved."). The error comes back as in 8.3.

## Decisions needed

### (1) Where the commit's rows come from
| Option | What it means |
|---|---|
| **A. Read Airtable again** *(recommended)* | The dialog keeps the key in memory between Preview and Import, and sends it again. The server keeps nothing between the two steps, and **writes what Airtable has at that moment**. If someone edited the table in between, the result shows the real counts. |
| B. Reuse the preview | The server keeps the preview's rows (interns' personal data) for some minutes, keyed by an id. That's extra storage, expiry and cleanup, and it could write rows Airtable no longer has. |

### (2) All or nothing
**Recommended: yes,** as v2's failed state says ("Nothing was saved"). Invalid rows are skipped, which isn't a failure; any other failure (Airtable, the database) undoes the whole run.

### (3) What an update changes
As approved in 8.2 (decision 3): the **seven mapped fields** (an empty cell clears an optional one), plus **`airtableRecordId`** and the **`airtableFields` snapshot**. The **username stays** (it's how they matched); **status, colour code, photo and history are never touched**. A read-only intern is never updated: 8.3 already makes that row invalid, and the domain refuses too.

### (4) Two imports at once
**Recommended: a per-batch lock** (a Postgres advisory lock on the batch's id) around step 3, so two runs on the same batch go one after the other. The second sees the first's interns, which are then updates, not duplicates. Different batches don't wait for each other. The unique username index (7.1) remains the last guard.

### (5) Recording a failure
DATA_MODEL's `airtable_imports` has `errors jsonb` for "per-record validation errors" but nowhere to say why a run failed.

**Recommended: add `failure_reason text null`,** with the same sentence the person saw ("Airtable is busy; try again in 30 seconds."). `errors` keeps the invalid rows: row number, username and reasons, **never field values**. DATA_MODEL is updated.

### (6) The view column
DATA_MODEL names it `view_id`, but the person types the view's **name** (v2: "View name").

**Recommended: rename it `view`** (text, required), holding what was typed, whether a name or a `viw…` id.

## Plan

### Schema
- **`import_status` enum** and **`airtable_imports`:** `id`, `batch_id` (FK, an index on `(batch_id, created_at)`), `base_id`, `table_id`, `view`, `status`, `record_count`, `created_count`, `updated_count`, `skipped_count`, `errors jsonb`, `failure_reason`, `imported_by` (FK users), `created_at`, `completed_at`.
- **Checks:**
  - the counts are ≥ 0;
  - `completed_at` is set exactly when not `pending`;
  - `failure_reason` is set exactly when `failed`.
- **Migration** via `pnpm db:generate --name airtable_imports`.
- **`skipped_count`:** added, so the result's "2 skipped" is stored, not recomputed. DATA_MODEL is updated.

### Contracts
- **`ImportResult`:** `{ importId, counts: { created, updated, skipped }, invalid: [{ row, username, reasons }] }`.

### API (intern module)
- **Domain:** `refreshFromAirtable(intern, { details, airtableRecordId, airtableFields, now })`. It's `updateDetails` with the stored username kept and the two Airtable fields set; read-only → `intern_read_only`.
- **`application/import-repository.ts` + `infrastructure/drizzle-import-repository.ts`:** `start`, `complete` and `fail` for a run.
- **The lock:** `shared/db/advisory-lock.ts` gains a per-key lock, taken with the batch's id inside the import transaction.
- **The `importInterns` use case:** steps 1–4 above, reusing `mapRecords` and `previewImport`.
- **`POST /batches/:batchId/imports`** → **201** `ImportResult` with `Location: /batches/:batchId/imports/:id`. Errors as 8.3. **Logs carry ids and counts only.**

### Tests
- **Repository:** a run is started (`pending`), then completed (with counts and errors) or failed (with the reason); the checks refuse `completed` without `completed_at`.
- **Domain:** `refreshFromAirtable` replaces the mapped fields (an empty one becomes `null`), keeps the username and history, sets the Airtable id and snapshot, and refuses a read-only intern.
- **Routes (Testcontainers, a fake source with 8.1's fixtures):**
  - **the first run:** 2 added and 1 updated (Ishita, added by hand first: her name, email and phone replaced from Airtable, her **status and history untouched**, her snapshot and record id set); the new interns' history reads "Imported from Airtable."; the run `completed` with counts and `imported_by`;
  - **repeatable:** the same import again → 0 added and 3 updated, **still exactly 3 interns**;
  - **invalid rows are skipped** and stored in `errors` with their reasons, and no field values;
  - **all or nothing:** the source fails → 422 or 502, **no intern changed**, the run `failed` with the reason. A database failure part-way (a forced unique clash) → nothing written, the run `failed`;
  - **two runs at once** on the same batch → both succeed, and there are still no duplicates;
  - **access:** a mentor 403, a PM elsewhere 404, archived 409, signed out 401; malformed source 400 with no run recorded;
  - **the token appears in no log, run row or answer.**
- **Mutations** (on copies, restored with `cp`):
  - matching case-sensitive on commit;
  - the lock removed (the concurrent test);
  - updates touching status;
  - a failure leaving partial writes (the transaction split);
  - the run left `pending` after a failure.

  Each must fail a test.

### Out of scope
- **The dialog** (8.5).
- **The Imports tab (A25)** listing past runs. It isn't on the roadmap yet; suggested as a follow-up task after 8.5.
- **Background or queued imports.** A batch of about 70 records is one request.

### Steps
1. Schema, migration and DATA_MODEL; the run repository, with tests.
2. The domain operation and the lock, with tests.
3. The use case, route and wiring, with tests (the concurrency one included).
4. Run `pnpm check` and the mutations; write `REVIEW.md`. No browser check: nothing is visible until 8.5.

### Verification
- `pnpm check` exits 0, and the migration applies to a fresh database.
- The mutations fail tests.
