# 7.1 Schema — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/intern/infrastructure/schema.ts` | **The intern context's first file.** The **`intern_status`** and **`color_code`** enums (from contracts). **`interns`:** every DATA_MODEL column; `username` is citext; `status` defaults to `active`; `color_code` null means none; dates are read as strings. **`interns_batch_username_unique`** (`batch_id`, `username`), **`interns_batch_status_index`**, and the checks `interns_notice_check`, `interns_email_lower_check` and `interns_names_check`. **`intern_status_events`:** every DATA_MODEL column, **`intern_status_events_intern_index`** (`intern_id`, `created_at`), and the checks for change, onboarding, reason and notice. **No cascades** (decision 4). **`feedback_id` has no foreign key yet** (decision 2). |
| `apps/api/drizzle/0003_intern.sql` (+ meta) | Generated, read, and **ended with the hand-written append-only trigger** (decision 3A): a plpgsql function raising `restrict_violation` on `UPDATE` or `DELETE`. Generating again reports "No schema changes". |
| `apps/api/src/modules/intern/infrastructure/schema.int.test.ts` | 11 tests against Postgres |
| `apps/api/src/shared/db/pg-error.ts` | `restrictViolation: '23001'` |
| `packages/contracts/src/intern-status.ts`, `color-code.ts`, `index.ts` | `internStatuses` and `colorCodes` tuples for the Postgres enums; `InternStatus` and `ColorCode` are built from them |
| `DATA_MODEL.md` | The checks, the unique username within a batch, the trigger, and the deferred `feedback_id` key |

## How to verify
```sh
pnpm check                                    # contracts 59 + web 133 + api 411
docker compose up -d --build --wait           # migrate applies 0003_intern
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 59 + 133 + **411** (+11). `pnpm format:check` is clean. |
| `interns` (5) | Defaults (uuid v7, `active`, no colour, no notice). **A username unique within a batch, ignoring case; the same username in another batch is accepted.** **On notice without an end date, or an end date while active → `interns_notice_check`;** on notice with an end date is accepted. An upper-case email → `interns_email_lower_check`. A blank username or name → `interns_names_check`. Unknown batch → 23503; unknown status or colour → 22P02. |
| `intern_status_events` (6) | **Onboarding** (no `from`, no reason) is accepted, then a reasoned notice. **Onboarding to anything but `active`** → the onboarding check; **a "change" to the same status** → the change check. **No reason, or only whitespace and newlines** → the reason check. **Notice without a start, without an end, ending on its start, or dates on a non-notice event** → the notice check. **`UPDATE` and `DELETE` → 23001 (the trigger),** and the row is still there. An unknown actor → 23503; deleting an intern with history, or a batch with interns → 23503. |
| **Mutations** (on a copy of `0003_intern.sql`, restored with `cp`) | **4, all caught:** the trigger removed; the username unique on `username` alone (fails "the same username in another batch"); `interns_notice_check` removed (my first attempt at this one didn't change the file, which I spotted from the grep and redid); the notice check without `notice_ends_on IS NOT NULL`. |
| **Compose** | `migrate` exited 0 ("migrations applied"). psql `\d` shows both tables, the three indexes, all seven checks, the three foreign keys and the trigger `BEFORE DELETE OR UPDATE … FOR EACH ROW`. |

## Decisions & trade-offs
- **All four decisions taken as recommended:** the checks, `feedback_id` without a key until 9.1, the append-only trigger, and no cascades.
- **The trigger raises `restrict_violation` (23001)**, so the API can recognise it if a bug ever tries to edit history.
- **"Not blank" is a regular expression (`~ '[^[:space:]]'`), not `trim`:** Postgres' `trim()` strips only spaces.

## Deviations from plan
- **The tests caught two real bugs in my checks, both fixed before review:**
  - **The notice check allowed a missing end date.** `end > start` is NULL when `end` is NULL, and Postgres passes a CHECK that is NULL. Both dates are now tested for NULL first. A test covers it, and a mutation confirms the test catches it.
  - **A reason of only newlines was accepted,** because `trim()` strips only spaces. That's fixed as above, for names too.
- **`0003_intern` was regenerated twice** to include those fixes. It has never been applied anywhere except the throwaway test databases, so that's safe. The trigger was re-appended each time.

## Not done / follow-ups
- **7.2:** the `Intern` aggregate and its status rules (transitions, reasons, notice dates).
- **9.1:** the foreign key from `intern_status_events.feedback_id` to `feedback`.
- **8.4:** `airtable_imports`.
