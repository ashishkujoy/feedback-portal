# 7.1 Schema — Plan

**Phase:** 7 — Interns
**Status:** Done

## Goal
`interns` and `intern_status_events` tables

## Done when
- **Migration `0003_intern` applies** to the test database and to Compose: the `interns` and `intern_status_events` tables, with the `intern_status` and `color_code` enums.
- **Schema tests** (Testcontainers) cover the defaults, the unique username within a batch, the checks and the foreign keys. `pnpm check` passes.

## What DATA_MODEL says (§3 intern)
- **`interns`:**
  - `id`, `batch_id` → batches (exactly one batch), `airtable_record_id` (null);
  - `username` (citext, **unique within the batch**; shown as `@username`; re-imports match on it);
  - `name`, `email` (lower-cased), `phone`, `diploma_branch`, `parent_names`;
  - `interview_notes` (Markdown), `airtable_fields` (jsonb snapshot), `photo_public_id` (Cloudinary);
  - **`status`** (default `active`; denormalized, since the events are the source of truth), **`color_code`** (null means none; denormalized from feedback);
  - `notice_ends_on` (set while on notice), timestamps;
  - an index on (`batch_id`, `status`).
- **`intern_status_events`** (**append-only**):
  - `id`, `intern_id`;
  - `from_status` (null for the onboarding `active` event), `to_status`;
  - `reason` (Markdown, required except at onboarding);
  - `notice_starts_on` / `notice_ends_on` (required when going on notice);
  - `feedback_id` (the feedback that gave notice, if any);
  - `actor_id` → users, `created_at`.
- **`airtable_imports`** belongs to 8.4 (ROADMAP), not here.

## Decisions needed

### (1) Checks the database enforces
The domain (7.2) checks all of these with friendly errors. These are the safety net, as in 6.1. **Recommended: all of them.**

| Table | Check |
|---|---|
| `interns` | **`notice_ends_on` is set exactly when `status = 'on_notice'`** |
| `interns` | **`email = lower(email)`** (DATA_MODEL: lower-cased). A username can't be empty, and neither can a name. |
| `intern_status_events` | **`from_status IS DISTINCT FROM to_status`** (a change is a change) |
| `intern_status_events` | **Onboarding:** `from_status` is null only when `to_status = 'active'` |
| `intern_status_events` | **A reason, unless onboarding:** `from_status IS NULL OR length(trim(reason)) > 0` |
| `intern_status_events` | **Notice dates exactly when going on notice,** with the end after the start |

### (2) The link to feedback
`intern_status_events.feedback_id` points to `feedback`, which arrives in **9.1**.

**Recommended: create the column now (uuid, null) and add its foreign key in 9.1's migration.** That avoids an empty placeholder `feedback` table now. The alternative is to leave the column out until 9.1.

### (3) "Append-only" in the database
| Option | What it means |
|---|---|
| **A. A trigger that rejects `UPDATE` and `DELETE` on `intern_status_events`** *(recommended)* | The history really can't be edited, even by hand or by a bug. It's a few lines of custom SQL in the migration, and it's tested. (The tests' `TRUNCATE` cleanup isn't affected.) |
| B. The application only | Simpler, but nothing stops a stray `UPDATE`. |

### (4) Deletes
**Recommended: no cascades**, as for batches. Interns aren't deleted (their history matters), so a delete of an intern with events, or of a batch with interns, fails.

## Plan
- **`packages/contracts`:** an `internStatuses` tuple (like `roles`) and a `colorCodes` tuple, for the Postgres enums. The existing `InternStatus`/`ColorCode` schemas are built from them.
- **`apps/api/src/modules/intern/infrastructure/schema.ts`** (the intern context's first file):
  - `internStatusEnum` and `colorCodeEnum`;
  - **`interns`**, with the unique index `interns_batch_username_unique`, the index `interns_batch_status_index`, and the checks from decision 1;
  - **`internStatusEvents`**, with the index `intern_status_events_intern_index` on (`intern_id`, `created_at`) for the timeline, and the checks from decision 1.
- **The migration:** `db:generate --name intern`. I'll read the SQL, then **add the append-only trigger** (decision 3A) as hand-written SQL at the end of the same file. Generating again must report no changes.
- **No API or web changes.**

### Tests (`intern/infrastructure/schema.int.test.ts`)
- **Defaults:** uuid v7, `status` `active`, `color_code` null, timestamps.
- **Username:**
  - unique within a batch, ignoring case;
  - **the same username in another batch is accepted.**
- **Each check from decision 1,** with the constraint's name:
  - on notice without an end date, and an end date while active;
  - an upper-case email;
  - an empty username or name;
  - a "change" to the same status;
  - an onboarding event to something other than `active`;
  - a change without a reason, or with only whitespace;
  - going on notice without dates, or with the end before the start;
  - dates on a non-notice event.
- **Foreign keys:** an unknown batch or actor is rejected; deleting an intern with events, or a batch with interns, is rejected.
- **Append-only:** `UPDATE` and `DELETE` on an event are rejected, with the trigger's message.
- **Enums:** an unknown status or colour is rejected.
- **Mutations** (on a copy of the generated SQL, restored with `cp`): the trigger removed; the username index on `username` only (so the same username in two batches fails); the notice check removed. Each must fail a test.

### Steps
1. The contracts tuples and the schema; generate and read the migration; add the trigger.
2. Schema tests.
3. `DATA_MODEL.md` gets the extra checks, the trigger, and the deferred `feedback_id` key. Run `pnpm check`, apply to Compose (and check `\d` in psql), and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- **Compose:** `migrate` applies `0003_intern` and exits 0; psql shows both tables, their indexes, checks and the trigger.
