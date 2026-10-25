# 8.6 Field mapping per batch — Plan

**Phase:** 8 — Airtable import
**Status:** Done

## Goal
Default Airtable column names, changeable per batch in the import; the username from a column or the email; matching by Airtable record

## Why
Importing the real view (61 records) gave 61 invalid rows: "Username is required." and "Invalid email address." on every one. 8.2 hard-coded placeholder column names. The real view has **no username column**, its email column is **`Email ID`**, and it can't be changed. Other batches' views may name things differently again, so **each batch keeps its own mapping**, starting from defaults and changeable before each import.

A read-only probe of the real view (column names, types and counts only) found:
- `Name`: 61/61;
- `Email ID`: 61/61, no duplicates;
- the part of `Email ID` before the @: 61/61, no duplicates, all valid usernames;
- `Mobile Number`: 59/61, with `Whatsapp number` covering 2 of the other 2;
- `Diploma Branch`;
- no parents' names or interview notes column (the interview is spread over about 20 `Round 1` / `Round 2` columns).

## Done when
- **A new step in A10, "Fields"**, between Source and Preview (decision 1): Source → **Fields** → Preview → Result.
  - After the source is entered, the API reads the view and lists **its column names**.
  - Each intern field has a select of those columns, **pre-filled** from the batch's saved mapping, or else from the defaults (decision 4).
  - **Username** also offers **"From the email (before @)"** (decision 2).
  - Required fields (username, name, email) must be chosen before Preview.
  - A saved column that the view no longer has shows as unset, with "\<column\> isn't in this view.".
- **The defaults** (built in, matched ignoring case, spaces and apostrophes; the first present wins):

  | Intern field | Default columns |
  |---|---|
  | username | `Username`, else **from the email** |
  | name | `Full name`, `Name` |
  | email | `Email`, **`Email ID`** |
  | phone | `Phone`, `Phone number`, **`Mobile Number`** |
  | diplomaBranch | `Diploma branch` |
  | parentNames | `Parents' names`, `Parent names` |
  | interviewNotes | `Interview notes` |

- **The batch's mapping is saved when an import runs** (not on preview). The next import for that batch starts from it. Admins and the batch's PM, as for importing.
- **Preview and import use the chosen mapping.** The rules are otherwise as before (7.3's checks, every reason listed). A derived username goes through the same rules as a typed one.
- **"Email is required"** instead of "Invalid email address" for a blank email (Add intern and Edit details too, since they share the contract).
- **Re-imports match the Airtable record first:**
  - a row whose record id belongs to an intern in the batch updates that intern and keeps its username (so a changed email doesn't create a second intern);
  - otherwise the username matches as before, but only an intern with no record id (added by hand), which the import then claims;
  - a username that belongs to an intern from **another** record makes the row invalid: "\<username\> belongs to another Airtable record.";
  - the read-only rule is unchanged.
- API and web tests, a browser check (made-up data through a stand-in Airtable, as in 8.5), and `pnpm check` pass. Then **you** preview the real view through the app: 61 new and 0 invalid, and nothing is imported unless you choose to.

## Decisions — all accepted as recommended
v2 has no screen for this, so decisions 1 and 3 are improvised in Kuat's existing pieces (Field, Select, A10's step dots) and need your approval.

### (1) Where the mapping is edited
**Recommended: a "Fields" step inside A10**, because the choices come from the view's real columns (no typing, no typos), and you see them right before previewing:
```
Import interns from Airtable
✓ Source ── 2 Fields ── 3 Preview ── 4 Result

Match the view's columns to intern fields. Saved for <batch> when you import.

Username *        [ From the email (before @)   ▾ ]
Name *            [ Name                        ▾ ]
Email *           [ Email ID                    ▾ ]
Phone             [ Mobile Number               ▾ ]
Diploma branch    [ Diploma Branch              ▾ ]
Parents' names    [ Not imported                ▾ ]
Interview notes   [ Not imported                ▾ ]

                                  [ Back ]  [ Preview import ]
```
Each row is a Kuat Field (label left, 160px) with a Select. Optional fields offer "Not imported".

**Alternative:** a separate "Airtable fields" dialog on the batch page, with typed column names. It can be set before any import, but there are no column suggestions and typos are possible.

### (2) The username
**Recommended:** the username select lists the view's columns **plus "From the email (before @)"**. The default is a `Username` column when the view has one, otherwise from the email.

### (3) Several columns for one field
The real view's interview is in about 20 columns.
**Recommended:** **not now.** Each field takes one column, and interview notes and parents' names stay "Not imported" for this view. Every column is still kept in `airtable_fields`. Combining columns (for example, interview rounds into one Markdown note with a heading per column) can be its own task if you want it.

### (4) A new batch's starting mapping
**Recommended:** a batch with no saved mapping starts from **the most recently saved mapping of any batch**, else the built-in defaults, since each year's view is likely to look like last year's. Alternatively, it always starts from the built-in defaults.

## Plan
- **Migration `0006`:** `airtable_field_mappings` (`batch_id` primary key → batches, `mapping jsonb`, `updated_by` → users, `updated_at`), in the intern module.
- **Contracts (`intern-import.ts`):**
  - `FieldMapping`: `{ username: { column } | { fromEmail: true }, name, email, phone?, diplomaBranch?, parentNames?, interviewNotes? }`;
  - `ImportColumns` (`{ columns, mapping, missing }`);
  - preview and run take `{ source, mapping }`;
  - the email's "Email is required";
  - the error codes.
- **API:**
  - `POST /batches/:id/imports/columns` (the source) → the view's column names (the union over its records, in first-seen order) and the starting mapping, with any saved column the view lacks listed as `missing`;
  - `mapRecords(records, mapping)` replaces the fixed column table, keeping `defaults` for suggestions;
  - preview and run validate that the mapping's columns exist in the view;
  - run saves the mapping inside the import's transaction;
  - record-first matching, with `usernamesForBatch` also selecting `airtable_record_id`.
- **Web (`import-dialog.tsx`):** the Fields step (a 4-step indicator), Back to Source, Preview with the mapping. Back from Preview returns to Fields with the choices kept.
- **Fixtures:** a made-up page with the real view's column names.
- **Docs:** `design/README.md` (A10 as built in 8.6), PRODUCT.md §8 rule 5 (matched by Airtable record, then username).

### Tests
- **Mapping:** a chosen column per field; the username from the email; an optional field not imported; a saved column the view lacks; the defaults on the real column names; "Email is required".
- **API:**
  - columns from a view;
  - the starting mapping (saved, the last batch's, the defaults);
  - preview and run with a mapping;
  - the mapping saved on run only;
  - an unknown column refused (422);
  - managers only.
- **Matching:**
  - by record id, keeping the username after an email change;
  - a hand-added intern claimed;
  - another record's intern → invalid;
  - a re-run creates no duplicates.
- **Web:**
  - the Fields step pre-filled;
  - required fields blocking Preview;
  - "From the email" sent;
  - Back keeps choices;
  - a missing saved column shown.
- **Mutations** (on copies, restored with `cp`, checked with `cmp`):
  - the mapping saved on preview;
  - matching by username only;
  - the derived username keeping the domain;
  - required fields not enforced.

### Out of scope
- **Combining several columns into one field** (decision 3).
- **The Airtable photo as the profile photo** (7.5 MB, over the 5 MB limit).
- **Editing the mapping outside an import** (decision 1's alternative).

### Steps
1. Migration, contracts, the mapping by configuration, and their tests.
2. The columns endpoint, preview and run with a mapping, saving, record-first matching, and their tests.
3. The Fields step in A10 and its tests.
4. `pnpm check`, mutations, a browser check against a stand-in Airtable, `REVIEW.md`; then your preview of the real view.

### Verification
- `pnpm check` exits 0; the mutations fail tests; the real view previews as 61 new and 0 invalid.
