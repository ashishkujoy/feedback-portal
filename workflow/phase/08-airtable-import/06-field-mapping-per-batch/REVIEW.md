# 8.6 Field mapping per batch — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/drizzle/0006_airtable_field_mappings.sql`, `intern/infrastructure/schema.ts` | **`airtable_field_mappings`:** `batch_id` (primary key → batches), `mapping jsonb` (column names only), `updated_by` → users, `updated_at`. |
| `packages/contracts/src/intern-import.ts` | **`FieldMapping`:** the username is `{ kind: 'column', column }` or `{ kind: 'fromEmail' }`. Name and email are required; the optional fields are `null` when not imported. **`ImportRequest`** is the source plus the mapping, for preview and run. **`ImportColumns`** is the view's columns, the starting mapping (`null` where nothing fits) and the saved columns the view lacks. `mappedFields` gives the order. |
| `packages/contracts/src/intern.ts`, `intern/domain/intern.ts`, `problem.ts` | **"Email is required"** for a blank email (Add intern and Edit details too), then the format check. A new code, **`airtable_mapping_invalid`**. |
| `intern/application/airtable-mapping.ts` | **`mapRecords(records, mapping)`** reads the chosen columns. A username **from the email** is the part before the @, under the same rules. **`defaultColumns`** adds `Email ID` and `Mobile Number` to 8.2's names. **`viewColumns`** gives the columns, first seen first. **`startingMapping`** gives the saved mapping where the view still has its columns (matched ignoring case and spaces), else the defaults, and lists what's missing. **`unknownColumns`** finds mapped columns the view lacks. |
| `intern/application/import-preview.ts`, `drizzle-intern-queries.ts` | **Matching by Airtable record first.** A row whose record belongs to an intern updates it and keeps its username. Otherwise the username matches an intern added by hand (which is claimed). A username held by an intern from **another record** makes the row invalid: "\<username\> belongs to another Airtable record.". |
| `intern/application/manage-interns.ts`, `field-mappings.ts`, `drizzle-field-mappings.ts`, `intern-admin.ts` | **`listImportColumns`** is for managers and starts from the batch's mapping, else the latest saved, else the defaults. Preview and run **refuse a mapping naming a column the view lacks** (422, "This view has no “X” column. Choose the fields again."). **The run saves the mapping** in its transaction; a preview saves nothing. A stored mapping that no longer parses counts as none. |
| `intern/http/imports.routes.ts` | **`POST …/imports/columns`** (the source). Preview and run take `ImportRequest`. Logs carry counts only. |
| `apps/web/src/interns/import-dialog.tsx`, `import-fields.ts`, `api/imports.ts` | **The Fields step** (decision 1; layout in `design/README.md`). Source's button is now **Next**, then Fields, then Preview with the mapping. Back keeps the choices. The steps are Source → Fields → Preview → Result. "Choose a column." with focus on the first unset field. The note "“X” isn't in this view." goes once another column is chosen. An empty view says so. The description now says "matched by their Airtable record or username". |
| `apps/api/test/fixtures/airtable/real-columns.json` (+ README) | Made-up people under the real view's column names (no username column, an attachment, numbers, a trailing space). |
| `ROADMAP.md`, `workflow/README.md`, `PRODUCT.md` §8 rule 5, `design/README.md` | The 8.6 row; the per-batch mapping and the matching order; "Import fields (A10) as built in 8.6". |

## How to verify
```sh
pnpm check     # contracts 80 + web 342 + api 634
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** Contracts 80 (+4), web 342 (+6 net), API 634 (+16). Format and lint clean, with no suppressions. No new dependencies; `pnpm-workspace.yaml` unchanged. |
| Contract tests | Both username kinds; name and email required; the import request needs a mapping; a blank email is "Email is required". |
| Mapping tests (12) | The fixtures through 8.2's columns. Unmapped fields left empty. **Usernames from `Email ID`** (`Vikram.Rao63@…` → `vikram.rao63`), with `plus+tag` refused by the username rule and a missing email giving both reasons. The view's columns in first-seen order. **Defaults on the real column names** and on 8.2's in other cases. A saved mapping with a renamed-case column kept and a vanished one listed. Unknown columns found. |
| Preview tests (7) | **Record first:** after an email change, the intern keeps its username. **A hand-added intern claimed. Another record's intern refused.** Read-only and duplicate rules as before. |
| API tests (29) | **Columns:** the real view's columns and the defaults; the saved mapping for its batch **and** for a new batch (the latest); saved columns the view lacks; managers only (admin 200, PM 200, mentor 403, another PM 404, signed out 401). **Import of the real view:** 3 new with derived usernames, **the mapping saved on run and not on preview**, and Leela's phone empty because Whatsapp wasn't mapped. **An unknown column** refused by both preview and run, writing nothing. **A re-import after an email change** updates the same intern. **Another record with the same username** is invalid. All of 8.3–8.4's tests pass with the mapping. |
| Web tests (24) | The flow with Next → Fields → Preview → Result. **Fields:** every field pre-filled, focus on Username, options = "Not imported" + the columns; a username column, Whatsapp for phone and a field left out are all sent. Required fields unset → "Choose a column." with nothing sent, and the note clears once chosen. The API's refusal is shown. An empty view. Back from Preview keeps the choices; Back again keeps the source. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:** the mapping saved on preview (2 failing tests); matching by username only (3); the derived username keeping the domain (4); required fields not enforced in the dialog (1). |
| **Browser** (Compose with a local stand-in Airtable serving the made-up fixtures; test users only, then deleted; the API set back to Airtable's address) | **Real-column view:** the steps "✓ Source · 2 Fields · 3 Preview · 4 Result". Fields pre-filled: From the email, Name, Email ID, Mobile Number, Diploma Branch, Not imported ×2. Focus on Username; 160px labels, 36px selects, a 560px dialog. **Phone → Whatsapp number, Preview:** 3 new, 0 invalid. Back keeps Whatsapp. **Import:** 3 added; the roster shows Arjun Mehta, Leela Iyer and Rohan Das, with `@arjun.mehta07`. **The same batch again** starts with Whatsapp number (saved). **Another batch** starts from it too (the latest). **A view with 8.2's columns:** Name and Email unset with "“Name” isn't in this view.". Preview → "Choose a column." on both, focus on Name. **An empty view:** "This view has no records" and Back. |

## Decisions & trade-offs
- **All four decisions as recommended:** the Fields step inside A10; "From the email (before @)" for the username; one column per field; a new batch starting from the latest saved mapping.
- **Not in v2:** the Fields step as a whole, its intro line and notes, "Next" on Source, and the new wording of the dialog's description. All are built from existing Kuat pieces.
- **A column Airtable leaves out because it's empty on every record** isn't offered, since the API only sees columns with a value somewhere. A saved mapping naming such a column shows it as not in the view.
- **Matching by record means a username never changes on re-import,** even when the email (and so the derived username) does. That's intended: the username is how people find the intern.
- **The view is read twice before an import** (Fields, then Preview) and again by the run. That's three requests for a view under 100 records, well within Airtable's limits.

## Deviations from plan
- **No "missing column" error on its own:** choosing from the view's real columns makes it unnecessary. The API still refuses a mapping that names a column the view lacks (`airtable_mapping_invalid`).
- `ImportColumns` also returns `recordCount`, so the Fields step can tell an empty view.

## Not done / follow-ups
- **Your real import:** open Import from Airtable on your batch. The Fields step should show From the email, Name, Email ID, Mobile Number and Diploma Branch, and Preview should show 61 new, 0 invalid. Nothing is imported until you press Import.
- Combining several columns (the interview rounds) into one field (decision 3), and the Airtable photo, are left for later tasks if wanted.
