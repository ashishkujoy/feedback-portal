# 8.3 Import preview API — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/src/intern-import.ts` (+ test), `problem.ts` | **`ImportSourceRequest`** `{ token, baseId, tableId, view }`, trimmed, with v2's wording ("A base ID starts with 'app'", "A table ID starts with 'tbl'"), for the API and later the form. **`ImportPreview`** `{ recordCount, counts, new, updated, invalid }`, where every invalid row has at least one reason. Error codes **`airtable_source_invalid`** and **`airtable_unavailable`**. |
| `apps/api/src/shared/errors/app-error.ts`, `shared/http/error-handler.ts` | Two error kinds: **`unprocessable` (422)** and **`upstream` (502)**, with their factories. |
| `intern/infrastructure/airtable-rest-source.ts` | **Uses `ImportSourceRequest`** instead of its own copy of the rules, so the API, the adapter and (8.5) the form check the same thing. |
| `intern/application/import-preview.ts` (+ test) | **Pure `previewImport(mapped, existing, recordCount)`:** valid rows split into **new** and **updated** by username (both sides lower-cased; every match counts as updated, decision 1); **a match with a graduated, terminated or withdrawn intern is invalid,** "… has graduated / was terminated / withdrew, so their record is read-only." (decision 2); 8.2's invalid rows passed through, all in row order; the counts. |
| `intern/application/intern-queries.ts`, `infrastructure/drizzle-intern-queries.ts` | **`usernamesForBatch`:** `[{ id, username, status }]`. |
| `intern/application/manage-interns.ts` | **`previewInternImport`:** the batch's managers and not archived (7.3's check) together with the existing interns, in one short transaction. Then **Airtable is read outside any transaction**, mapped (8.2) and compared. `ManageInternsDeps` gains `airtable`. |
| `intern/http/airtable-problems.ts` | **`AirtableError` → problems** (decision 3): a wrong key, base, table or view, or too many records → **422 `airtable_source_invalid`**; busy, a timeout or unexpected → **502 `airtable_unavailable`**. The `detail` is "Airtable said: \<TYPE\>. " followed by one plain sentence (for example "This key can't read the base."). |
| `intern/http/imports.routes.ts`; `app.ts`, `main.ts`, `test/app-deps.ts` | **`POST /batches/:batchId/imports/preview`**, mounted before `/batches` (one session check, as in 7.3), for admins and PMs by role. **Logs carry ids and counts, never the token.** `main.ts` builds the REST source from config; tests pass a fake. |
| `TECH_STACK.md`, `README.md` | **The token is typed per import and never stored, and is no longer listed among the `.env` secrets** (your 8.1 decision). The endpoint is documented. |

## How to verify
```sh
pnpm check     # contracts 72 + web 242 + api 547
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 72 (+3) + 242 + 547 (+17). Format and lint clean, with no suppressions or casts. |
| Pure preview (4) | **New vs updated:** an existing `Ishita.Rao` (stored mixed-case) matches `ishita.rao` → updated, with its id; 2 new. **Read-only:** graduated, terminated and withdrawn matches are invalid with their wording, while on notice still updates. **8.2's invalid rows** (missing username, duplicate, bad email) pass through in order. An empty view gives all zeros. |
| Routes (13, Testcontainers, a fake source returning 8.1's fixtures) | **The preview:** with Ishita already in the batch → new 2 (`zoya.ansari`, `kabir.nair`), updated 1 (Ishita, with her id); **the source was asked with exactly the request's values; Ishita's record unchanged.** **Graduated Ishita** → invalid with the reason, updated 0. **Access:** admin 200, PM 200, mentor 403, a PM elsewhere 404, signed out 401; **archived → 409, refused before Airtable is asked.** **Malformed source** → 400 with `token`, `baseId`, `tableId`, `view`, and **no call to Airtable**. **All eight `AirtableError` reasons** → the right status, code and `detail`. **The token appears in no log record,** and the counts are logged. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:** case-sensitive matching (after the test was changed to store `Ishita.Rao` mixed-case; with both sides lower-case it couldn't have failed); a graduated match counted as updated (unit and route); the manager check removed (a mentor got through); Airtable's 403 reported as 502. |
| Browser | **None:** nothing is visible until 8.5. |

## Decisions & trade-offs
- **All three decisions as recommended;** decision 4 (how the commit gets the rows) is for 8.4's plan.
- **No transaction is held while Airtable is read.** Access is checked first (so an archived batch or an outsider never reaches Airtable), and the preview is a moment's picture; 8.4's commit re-checks everything when it writes.
- **"Updated" includes matches with nothing changed,** as v2's three counts do. 8.4 still refreshes their Airtable record id and snapshot.

## Deviations from plan
- **The adapter now uses the shared `ImportSourceRequest`** instead of its own copy of the rules.
- **The case-insensitive test was strengthened** before the mutation run.

## Not done / follow-ups
- **8.4:** the commit (and `airtable_imports`), including whether it reads Airtable again or reuses the preview.
- **8.5:** the dialog, with the Base ID field you asked for.
