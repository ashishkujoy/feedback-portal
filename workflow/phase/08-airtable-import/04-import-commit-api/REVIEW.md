# 8.4 Import commit API — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/intern/infrastructure/schema.ts`, `drizzle/0004_airtable_imports.sql` | **`import_status`** (`pending`, `completed`, `failed`) and **`airtable_imports`**: the batch, `base_id`, `table_id`, **`view`** (decision 6), the status, `record_count`, `created_count`, `updated_count`, **`skipped_count`**, `errors` (jsonb), **`failure_reason`** (decision 5), `imported_by`, `created_at`, `completed_at`. An index on (`batch_id`, `created_at`). **Checks:** counts ≥ 0; `completed_at` set exactly when not pending; `failure_reason` exactly when failed. **The token has no column.** |
| `DATA_MODEL.md` | The table as built: the renamed `view`, the added `skipped_count` and `failure_reason`, the checks, and "a failed run changes no intern". |
| `intern/domain/intern.ts` (+ test) | **`refreshFromAirtable`:** the mapped fields replaced (an empty one cleared), **the username kept**, `airtableRecordId` and `airtableFields` set; status, colour code, photo and history untouched; read-only refused. |
| `intern/application/import-runs.ts`, `infrastructure/drizzle-import-runs.ts` (+ int test) | **Runs:** `start` (pending), `complete` (counts, the invalid rows or `null`, `completed_at`) and `fail` (the reason, `completed_at`). |
| `intern/application/intern-admin.ts`, `infrastructure/drizzle-intern-admin.ts` | The transaction scope gains `importRuns` and **`lockImports(batchId)`**, an advisory lock named after the batch (decision 4). |
| `intern/application/airtable-source.ts`, `http/airtable-problems.ts` | **`describeAirtableError`** moved into the application, so a failed run keeps the same sentence the person sees. |
| `intern/application/manage-interns.ts` | **`importInterns`:**<br>• access, then **the run recorded as `pending`** on its own;<br>• **Airtable read again** (decision 1), outside any transaction;<br>• then **one transaction under the batch's lock:** access re-checked, compared with the interns *as they are now* (8.3's `previewImport`), new interns added with `onboardIntern` (the record id, the snapshot, and the importer as the actor), matches refreshed (after locking each row), and the run completed;<br>• **any failure:** the transaction rolls back (decision 2) and the run is marked `failed` with the reason.<br>The saves run one after another (they share one connection) without a loop `await`. |
| `intern/http/imports.routes.ts`; `main.ts`, `test/app-deps.ts`; `packages/contracts/src/intern-import.ts` | **`POST /batches/:batchId/imports`** → **201** `ImportResult` `{ importId, counts: { created, updated, skipped }, invalid }` with `Location`. Errors as in 8.3. Logs carry ids and counts. |
| `README.md` | The endpoint. |

## How to verify
```sh
pnpm check     # contracts 72 + web 242 + api 561
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 72 + 242 + 561 (+14). Format and lint clean, with no suppressions. The new migration applies in the test databases. |
| Domain (2) | A refresh replaces the name and email (lower-cased), clears the phone and branch, keeps `ishita.rao` although another username was given, **keeps `on_notice` and the same history**, and sets the record id and snapshot. A graduated intern → `intern_read_only`. |
| Runs (4) | Pending on start; completed with its counts and invalid rows; failed with the reason; the checks refuse `completed` without a time and `failed` without a reason. |
| Commit route (8) | **The first run:** 201 with 2 created and 1 updated. **Ishita (added by hand first) now has Airtable's email and phone, is still active, has one history row, and has the Airtable record id and snapshot ("Interview score").** The batch has exactly `ishita.rao`, `kabir.nair`, `zoya.ansari`. The run is completed (3 read, 2/1/0, `imported_by` the PM, the base and view). A new intern's profile says `source: airtable`, added by the PM. **Again:** 0 created, 3 updated, **still 3 interns**, and two completed runs. **An invalid row** (no username, a bad email) is skipped, stored with its reasons, **and the name it contained appears nowhere in the run.** **Airtable busy → 502**, still one intern, the run failed with "Airtable said: RATE_LIMIT_REACHED. Airtable is busy; try again in 30 seconds." **A failure part-way** (a NUL character Postgres can't store, in the third row) → 500, **only Ishita, unchanged; the new intern written before the failure was rolled back;** the run failed, "The import couldn't be saved." **Two imports at once** → both 201, one creating 2 and the other 0, **3 interns** (passed 3 runs out of 3). **Access:** mentor 403, a PM elsewhere 404, signed out 401, a malformed base 400, archived 409, **with no Airtable call and no run recorded.** **The token** is in no answer, run row or log record. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:** **the lock removed** (the concurrent test failed **3 runs out of 3**; the first attempt didn't apply because the formatter had split that line, so it was redone); `refreshFromAirtable` setting the status (domain); **new interns saved in a separate, earlier transaction** (3 tests: all-or-nothing and others); the run left pending after a failure (2 tests). **Matching case-insensitively on commit** uses 8.3's `previewImport`, whose mutation is already caught there. |
| Browser | **None:** nothing is visible until 8.5. |

## Decisions & trade-offs
- **All six decisions as recommended.**
- **One odd character in any Airtable cell fails the whole import,** as found while writing the all-or-nothing test: Postgres's `jsonb` can't store a NUL character (`\u0000`). The person sees a failed run ("The import couldn't be saved.") and nothing changes, which is safe, but the reason doesn't point at the cell. **Worth a small follow-up:** strip NUL characters from the snapshot during mapping (8.2), since they're never meaningful.
- **Access is checked three times:** before recording the run, so outsiders leave no trace; before Airtable; and inside the lock, since the batch could be archived meanwhile.
- **Ishita's history isn't touched by an update,** so the status history only shows how an intern first arrived ("Added by hand." or "Imported from Airtable."). Later refreshes are in `airtable_imports`, not the history.

## Deviations from plan
- **`describeAirtableError` moved into the application layer** so a failed run stores the same words the person sees.
- **The planned case-sensitivity mutation** wasn't repeated, since the commit uses 8.3's tested comparison unchanged.

## Not done / follow-ups
- **8.5:** the dialog (with your Base ID field), keeping the key in memory between Preview and Import.
- **The Imports tab (A25):** past runs (not on the roadmap yet).
- **Strip NUL characters** from Airtable values (see above).
