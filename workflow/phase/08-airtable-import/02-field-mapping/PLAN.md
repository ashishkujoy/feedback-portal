# 8.2 Field mapping — Plan

**Phase:** 8 — Airtable import
**Status:** Done

## Goal
Map Airtable fields to intern fields and keep the raw record in `airtable_fields`

## Done when
- **A pure `mapRecords(records)`** in the intern module turns 8.1's `AirtableRecord[]` into:
  - **valid rows:** the row number, Airtable's record id, the intern's details normalised by the same rules as Add intern (7.3), and the **raw fields** for `airtable_fields`;
  - **invalid rows:** the row number, the username if there is one, and **readable reasons** (v2 A10's "Invalid rows" table: "Row 4 · — · Username is missing.").
- **Unit tests pass** (the roadmap's "Done when"), including against 8.1's recorded fixtures.
- **No database, HTTP or UI work.** 8.3 previews these rows, and 8.4 writes them.

## The mapping
**One table in one file** (`airtable-mapping.ts`), so your real column names are a one-line change:

| Intern field | Airtable columns accepted | Required |
|---|---|---|
| username | `Username` | yes |
| name | `Full name`, `Name` | yes |
| email | `Email` | yes |
| phone | `Phone`, `Phone number` | |
| diplomaBranch | `Diploma branch` | |
| parentNames | `Parents' names`, `Parent names`, `Parents names` | |
| interviewNotes | `Interview notes` | |

- **Column names match ignoring case, spaces and apostrophes** ("parents names" = "Parents' names"). If a record has two accepted columns for the same field, the first in the table wins.
- **Values:**
  - **text** is used as is, and a **number** becomes text (a phone typed as a number);
  - **a list of text** (multi-select, or a lookup) is joined with ", ";
  - **anything else** (attachments, collaborators, linked-record ids, checkboxes) makes the row invalid for that field: "Phone isn't text.";
  - **an empty cell** (Airtable leaves the key out) is "no value".
- **Rules:** exactly `CreateInternRequest` (7.3):
  - the username loses its leading "@" and is lower-cased, `[a-z0-9._-]`, 1–50 characters;
  - the name is 1–200 characters;
  - the email must be valid, and is lower-cased;
  - the optional fields have their limits, with blank → `null`;
  - the notes are up to 20,000 characters.

  **A row breaking any rule is invalid,** with every reason listed.
- **Within one import:** a username already used by an earlier row makes the later row invalid: "Username is used by row 2." (as v2 shows). Matching ignores case, since usernames are stored lower-cased.
- **Row numbers** are positions in the view, from 1, as Airtable lists them.
- **`airtable_fields`:** the record's **whole `fields` object as Airtable gave it** (DATA_MODEL: "Raw snapshot … for fields not modelled here"). That includes the mapped columns, so the snapshot is complete.

## Decisions needed

### (1) Unknown column names
**Recommended: the accepted names above,** with a note in `apps/api/.env.example`/README listing them. **If your table uses other names,** tell me and I'll add them to the list. The alternative, a configurable mapping in `.env`, is more setup for a list that rarely changes.

### (2) Reason wording
v2's sample says "Username is missing." The shared rules say "Username is required".

**Recommended: reuse the shared messages with a full stop,** for example "Username is required.", "Invalid email address.", so imports, Add intern and Edit details say the same thing. Duplicates say v2's "Username is used by row N."

### (3) Empty cells on re-import (raised now, applied in 8.4)
PRODUCT §5: "a re-import overwrites only the fields that come from Airtable."

**Recommended: the mapped columns are Airtable's.** An empty optional cell clears that field on re-import, just as a changed cell updates it. So **edits made in the portal (7.9) to mapped fields are replaced by Airtable's values;** fields the mapping doesn't cover (status, colour code, photo, history) are never touched. 8.2 produces exactly that: every mapped field, with `null` for empty.

## Plan
- **`intern/application/airtable-mapping.ts` (pure):**
  - `columns`, the table above;
  - `mapRecords(records) → { valid: MappedRow[]; invalid: InvalidRow[] }`;
  - value coercion, rules from `CreateInternRequest`, the duplicate check and reasons.
- **Types:**
  - `MappedRow = { row, recordId, details, airtableFields }`, with `details` in the domain's `DetailsInput` shape (already normalised);
  - `InvalidRow = { row, recordId, username: string | null, reasons: string[] }`.
- **Docs:** the accepted column names in README's import section.

### Tests (unit)
- **8.1's fixtures** (`page-1` + `page-2`) → three valid rows:
  - `Ishita.Rao` → `ishita.rao`;
  - the raw fields kept, including the extra "Interview score";
  - Zoya's missing phone → `null`;
  - the record ids and row numbers 1–3.
- **Column matching:** "full name" and "PARENTS NAMES" are recognised; with both `Full name` and `Name`, `Full name` wins.
- **Values:**
  - a number phone → text;
  - a multi-select of parents → "A, B";
  - an attachment array, a collaborator object or a checkbox → "… isn't text.";
  - whitespace-only → `null`.
- **Rules:**
  - a missing username, a bad email, a 51-character username, or a name of only spaces → invalid, with **all** reasons listed and the username shown when present;
  - a leading "@" is removed.
- **Duplicates:** rows 2 and 5 both `Zoya.Ansari` and `zoya.ansari` → row 5 is invalid, "Username is used by row 2."; row 2 stays valid.
- **An empty view** → no rows.
- **Mutations** (on a copy, restored with `cp`):
  - column names matched exactly;
  - the duplicate check ignoring case;
  - non-text values accepted;
  - the raw snapshot dropped.

  Each must fail a test.

### Out of scope
- **Preview and commit** (8.3, 8.4), **`airtable_imports`** (8.4), **the UI** (8.5).
- **Photos from Airtable attachments.** Photos come from 7.7 only.

### Steps
1. The column table and value coercion, test-first.
2. Rules, duplicates and reasons, with tests.
3. Run `pnpm check` and the mutations, and write `REVIEW.md`. No browser check: nothing is visible yet.

### Verification
- `pnpm check` exits 0.
- The mutations fail tests.
