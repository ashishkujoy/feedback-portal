# 8.2 Field mapping — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/intern/application/airtable-mapping.ts` | **`columns`:** the one table of accepted Airtable column names per intern field (decision 1), matched ignoring case, spaces and apostrophes, with the first listed winning. **`mapRecords(records)`** gives `{ valid, invalid }`:<br>• **values:** text as is; numbers written out; a list of text joined with ", "; anything else (attachments, collaborators, checkboxes, linked records) → "\<Field\> isn't text."; empty → no value;<br>• **rules:** exactly `CreateInternRequest` (7.3): the "@" removed and the username lower-cased; the name; the email lower-cased; the limits; blank → `null`;<br>• **reasons:** the shared messages with a full stop (decision 2), every one listed;<br>• **duplicates within one import:** "Username is used by row N.", ignoring case. **Only rows that will be imported claim a username,** so an invalid row doesn't block a later valid one;<br>• **`airtableFields`:** the record's whole `fields` object, untouched;<br>• row numbers are positions in the view, from 1. |
| `README.md` | **"Airtable columns":** the accepted names, where to change them, and what a re-import overwrites (decision 3). |

## How to verify
```sh
pnpm check     # contracts 69 + web 242 + api 530
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 69 + 242 + 530 (+7). Format and lint clean, with no suppressions or casts. |
| Mapping (7) | **8.1's recorded pages** → 3 valid rows (rows 1–3, their record ids, `Ishita.Rao` → `ishita.rao`), the full details, **the raw `fields` object itself kept** (including "Interview score": 8), and a missing phone → `null`. **Columns:** `USERNAME`, `full name` (winning over `name`), `PARENTS NAMES` and `phone number` are recognised. **Values:** the number 9845012345 → "9845012345"; a parents list → "Ramesh Rao, Kavitha Rao"; spaces only → `null`. **Not text:** an attachment, a collaborator and a checkbox give three "… isn't text." reasons. **Rules:** a missing username plus a bad email → both reasons with `username: null`; a 51-character username plus a blank name → both reasons, with the username shown as Airtable has it. **Duplicates:** `zoya.ansari` in row 2 and `@ZOYA.Ansari` in row 5 → row 5 invalid, "Username is used by row 2.". An invalid row 3 (`dev.bhat`, bad email) doesn't block row 4's `dev.bhat`. **An empty view** → nothing. |
| **Mutations** (on a copy, restored with `cp`, checked with `cmp`) | **4, all caught:** column names matched exactly; **duplicates matched case-sensitively** (it first survived, because the test's later duplicate was already lower-case; the test now uses `@ZOYA.Ansari`); non-text values accepted; the raw snapshot dropped. |
| Browser | **None:** nothing is visible until 8.5. |

## Decisions & trade-offs
- **All three decisions as recommended.** The accepted names are a guess at your table's headings. **Tell me your real ones** and it's a one-line change.
- **Decision 3 (re-imports overwrite the mapped fields, and empty cells clear them)** is produced here (`null` for an empty field) and applied in 8.4.
- **The raw snapshot is the same object Airtable gave,** so nothing is lost or reshaped before 8.4 stores it.

## Deviations from plan
- **Only valid rows claim a username** for the duplicate check. The plan didn't say, but otherwise an invalid row would make a later valid one invalid too.

## Not done / follow-ups
- **8.3:** the preview API (new, updated or invalid, with nothing written), the key typed per import, and TECH_STACK corrected.
- **Your real column names**, when you have them.
