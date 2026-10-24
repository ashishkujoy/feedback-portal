# 8.3 Import preview API — Plan

**Phase:** 8 — Airtable import
**Status:** Done

## Goal
Returns valid and invalid rows without writing anything

## Done when
- **`POST /batches/:batchId/imports/preview`** with `{ token, baseId, tableId, view }`:
  - reads the view through 8.1's adapter;
  - maps it with 8.2;
  - compares it with the batch's interns by username;
  - answers **what an import would do: new, updated and invalid rows**, as v2's A10 preview shows ("New 3 · Updated 1 · Invalid 2", then the invalid rows with their reasons).
- **Nothing is written:** no interns, no `airtable_imports` row. **The token is never stored or logged.**
- **Only the batch's managers** (admins and its PM, PRODUCT §5 / DATA_MODEL §5), never in an archived batch.
- **Airtable's failures come back as clear problems** carrying Airtable's own type (v2 A10-sourceerrors: "Airtable said: INVALID_PERMISSIONS. This token can't read the base.").
- **TECH_STACK is corrected:** the Airtable token is typed per import and never stored (your decision in 8.1).
- API tests pass, and `pnpm check` passes.

## The answer
```
{
  counts: { new, updated, invalid },
  new:     [{ row, username, name }],
  updated: [{ row, username, name, internId }],
  invalid: [{ row, username | null, reasons: string[] }],
  recordCount
}
```
- **new:** a valid row whose username isn't in the batch.
- **updated:** a valid row matching an intern of the batch by username (both lower-cased).
- **invalid:** 8.2's invalid rows, plus a matched intern who is read-only (decision 2).

## Decisions needed

### (1) "Updated" when nothing changed
**Recommended: every matched intern counts as Updated,** as v2 shows (New / Updated / Invalid). A re-import refreshes the Airtable record id and the raw snapshot even when the mapped fields are the same. The alternative is a fourth "Unchanged" count, which v2 doesn't draw.

### (2) A row matching a graduated, terminated or withdrawn intern
Those records are read-only (PRODUCT §10), so an import mustn't change them.

**Recommended: list the row as invalid** with "\<username\> has graduated, so their record is read-only." (or "was terminated" / "withdrew"). The row is skipped, and the person sees why. The alternative is skipping it silently, which hides that Airtable and the portal disagree.

### (3) Airtable's failures as problems
- **The key, base, table or view is wrong** (401, 403, 404, 422) → **422** with a new code **`airtable_source_invalid`**. The `detail` reads like v2: "Airtable said: INVALID_PERMISSIONS. This key can't read the base." (one sentence per reason).
- **Airtable is busy, slow or broken** (429, a timeout, 5xx, a malformed answer) → **502** **`airtable_unavailable`**, with 8.1's message ("Airtable is busy; try again in 30 seconds").
- **Too many records** → **422 `airtable_source_invalid`**.
- **Malformed input** (a base not `app…` and so on) → 400 `validation_failed` with field issues, from 8.1's check.

### (4) Preview, then commit (raised now, decided in 8.4)
The preview stores nothing, so **8.4's commit will either read Airtable again** (the browser keeps the key in memory between the two steps, and re-sends it) **or reuse a short-lived server-side copy of the preview** (without the key). 8.4's plan recommends one.

## Plan

### Contracts
- **`ImportSourceRequest`:** `{ token, baseId, tableId, view }`, with 8.1's rules and v2's messages ("A base ID starts with 'app'", "A table ID starts with 'tbl'"). It's shared with the web form in 8.5.
- **`ImportPreview`:** the answer above.
- **Error codes:** `airtable_source_invalid` and `airtable_unavailable`.

### API (intern module)
- **`InternQueries.usernamesForBatch(batchId)`:** `[{ id, username, status }]` for matching.
- **`application/import-preview.ts` (pure, tested):** `previewImport(mapped, existing)` → the answer, with decision 2's reasons.
- **The `previewImport` use case:**
  - the batch's managers, not archived (7.3's check), in a short transaction;
  - **reads Airtable outside it** (no database transaction is held open during a network call);
  - maps, compares, answers.
- **`AirtableError` → problems:** a small mapping in the route (decision 3); the `ProblemDetails` `detail` carries Airtable's type.
- **`POST /batches/:batchId/imports/preview`** → 200 `ImportPreview`, for admins and PMs by role. **Logs carry ids and counts only, never the token or field values.** The request logger already logs no bodies; a test checks that the token doesn't reach the logs.
- **Wiring:** `main.ts` builds the REST source from `config.airtable`; tests get a fake source.
- **TECH_STACK.md:** the Airtable row and the secrets line say the token is typed per import and never stored.

### Tests
- **Pure preview:**
  - new vs updated by username (case-insensitive);
  - read-only matches → invalid with each status's wording;
  - 8.2's invalid rows passed through;
  - the counts;
  - an empty view.
- **Routes (Testcontainers, a fake `AirtableSource` returning 8.1's fixtures):**
  - **the PM and an admin get the preview:** a batch with `ishita.rao` already in it → updated 1, new 2; one graduated intern → invalid with the reason;
  - **nothing written:** the interns are unchanged, and no `airtable_imports` table is touched (it doesn't exist yet);
  - **access:** a mentor → 403; a PM not on the batch → 404; archived → 409; signed out → 401;
  - **bad input** → 400 with field paths, and the source isn't called;
  - **each `AirtableError` reason** → its status, code and `detail` with Airtable's type;
  - **the token isn't in the logs** (a captured log sink) or in any answer.
- **Mutations** (on copies, restored with `cp`):
  - matching case-sensitive;
  - read-only matches counted as updated;
  - the manager check removed;
  - a 403 from Airtable mapped to 502.

  Each must fail a test.

### Out of scope
- **Writing anything** (8.4, including `airtable_imports`).
- **The dialog** (8.5).

### Steps
1. Contracts, error codes, queries, and the pure preview, with tests.
2. The use case, route, error mapping and wiring, with tests (the log check included).
3. TECH_STACK; run `pnpm check` and the mutations; write `REVIEW.md`. No browser check: nothing is visible until 8.5.

### Verification
- `pnpm check` exits 0.
- The mutations fail tests.
