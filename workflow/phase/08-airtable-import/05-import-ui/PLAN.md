# 8.5 Import UI — Plan

**Phase:** 8 — Airtable import
**Status:** Done

## Goal
Enter the source, preview, confirm, and see the result

## Done when
- **Import from Airtable** (outline, a download icon) sits in the batch header **between Add intern and Assign mentors** (v2 A2), for the batch's managers.
- **The roster's empty state** for managers reads v2's "Import interns from Airtable, or add them one at a time." with **Import from Airtable** (primary) and **Add intern** (outline).
- **The A10 dialog**, "Import interns from Airtable", "Into {batch}. Interns are matched by username: new ones are added and existing ones updated.", with the three-step indicator (Source, Preview, Result; ✓ for done steps, red for a failed one) and these states:
  - **Source:** the API key (a password field, "Used for this import only. It isn't stored."), **the Base ID (your addition)**, the table ID and the view name. **Preview import** checks them with the shared `ImportSourceRequest` first (A10-sourceerrors), then calls `POST …/imports/preview`. Airtable's refusal (422/502) shows "We couldn't connect to Airtable" with the API's sentence; the fields keep their values.
  - **Preview:** the New / Updated / Invalid strip; the invalid rows (Row, Username or "—", Reason) with "· skipped, not imported" and "Fix invalid rows in Airtable and import again, or add those interns by hand."; **Back** and **Import N interns** (N = new + updated).
  - **Importing:** the spinner and "Importing N interns".
  - **Result:** "Import completed", "3 added, 1 updated, 2 skipped. Skipped rows weren't changed." and the three rows; **Done**.
  - **Failed:** "Import failed" with the API's sentence and "Nothing was saved."; **Back** and **Try again**.
- **The key lives only in the dialog's form state:** cleared when the dialog closes, never put in the URL, storage, the query cache or logs; the input asks browsers not to save it.
- After a completed import, **the roster, the batch and the batches list refresh** (exact keys, as in 7.6).
- Web tests pass, `pnpm check` passes, and a browser check covers every state.

## Decisions needed

### (1) Where the Base ID goes
v2 has the API key on its own row, then Table ID and View name side by side.

**Recommended:** API key (full width); then **Base ID and Table ID side by side** (monospace, "Starts with "app"." and "Starts with "tbl"."); then **View name** full width. The two IDs come from the same Airtable URL, so they sit together. `design/README.md` records the difference.

### (2) The importing state
v2 shows a progress bar ("2 of 4") and "The import shows as pending in the batch's import history until it finishes.", plus **Close**. Our import is one request (8.4), so there is no progress to report, and the import history (A25) isn't built.

**Recommended:** the spinner and "Importing 4 interns" with **no progress bar** and **no history sentence**. **Close** stays: the import carries on in the server, and the roster refreshes when it finishes.

### (3) The result's "View import history"
**Recommended: leave it out** until A25 exists (a follow-up task). Only **Done** is shown.

### (4) Nothing to import
If every row is invalid (or the view is empty), N is 0.

**Recommended:** the preview still shows, with **Import 0 interns disabled**, so the person reads the reasons and goes back. Not in v2; it's the smallest change.

### (5) Error wording
The contract says 'A base ID starts with "app"', v2's sourceerrors says "Table IDs start with “tbl”." and "Enter an API key.".

**Recommended:** change the contract's messages to v2's wording ("Enter an API key.", "Base IDs start with “app”.", "Table IDs start with “tbl”.", "Enter a view name."), so the form and the API's 400 agree. The API tests that check messages are updated.

## Plan

### Web
- **`api/imports.ts`:** `previewImport(batchId, source)` and `runImport(batchId, source)`, with the contracts' schemas. **No query** (they're mutations; nothing about the source goes in a cache key).
- **`interns/import-dialog.tsx`:** the `Dialog` with a small step machine (`source` → `preview` → `importing` → `result` | `failed`). One React Hook Form (`zodResolver(ImportSourceRequest)`) holds the source; it's **mounted only while the dialog is open**, so closing it drops the key. Back keeps the values; Try again re-sends them.
  - The key's input: `type="password"`, `autoComplete="off"`, and `data-1p-ignore`/`data-lpignore` so password managers don't offer to save it.
  - The step indicator, the counts strip and the result rows are small local components in Kuat's style (no new `ui/` component unless one is reused).
  - Problems: `airtable_source_invalid` and `airtable_unavailable` show their `detail`; anything else shows "Something went wrong. Try again in a moment.".
- **`pages/batch-page.tsx`:** the header button; **`interns/roster-panel.tsx`:** the empty state's two buttons (an `onImport` prop beside `onAddIntern`).
- **`design/README.md`:** the as-built notes and decisions 1–4.

### Contracts
- The messages in decision 5 (and their tests).

### Tests (Vitest, stubApi)
- **Source:** the empty form shows the four messages and **makes no request**; a valid form posts exactly `{ token, baseId, tableId, view }` to `…/imports/preview`; a 422 shows the callout with the API's sentence and keeps the values.
- **Preview:** the counts, the invalid rows (one reason per line; "—" for no username), **Import 3 interns**; Back returns with the values kept; 0 importable → disabled.
- **Import:** posts the same source to `…/imports`; the importing state; the result's sentence and rows; **the roster, batch and batches queries invalidated (exact keys)**.
- **Failed:** a 502 shows "Import failed" with the sentence; Try again posts again; Back returns to the preview.
- **Closing and reopening** shows an empty form (the key is gone).
- **The batch page:** the button for managers only (admin, the batch's PM; not a mentor, not archived); the empty state's two buttons.
- **Mutations** (on copies, restored with `cp`): the form kept mounted after close (the key survives); the invalidation removed; Import sending only the preview's result instead of the source; client validation removed (an empty form reaches the API). Each must fail a test.

### Out of scope
- **The Imports tab (A25)** and "View import history" (a follow-up task).
- **Progress during an import** (decision 2).
- **Stripping NUL characters** from Airtable values (the 8.4 follow-up; a separate small task).

### Steps
1. Contract messages; `api/imports.ts`.
2. The dialog and its states, with tests.
3. The header and empty-state buttons, with tests; `design/README.md`.
4. `pnpm check`, mutations, and a headless-Chrome check of every state against the design (on localhost, with a stand-in Airtable from 8.1's fixtures via `AIRTABLE_API_BASE_URL`; **no real key or base**). Test rows deleted afterwards. Then `REVIEW.md`.

### Verification
- `pnpm check` exits 0; the mutations fail tests.
- Screenshots of Source, source errors, Preview, Importing, Result and Failed match v2 A10, apart from decisions 1–4.
