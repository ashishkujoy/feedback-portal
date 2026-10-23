# Intern Feedback Portal — Data Model

Database: PostgreSQL 18 (18.6) via Drizzle.

Conventions:
- **Primary keys:** `uuid` v7 (time-sortable). The app generates them (`newId()` in `shared/ids.ts`), so an entity has its ID before it is saved. Columns also default to Postgres 18's `uuidv7()`, for rows inserted by hand.
- **Timestamps:** `timestamptz`.
- **Column names:** `snake_case`.
- **Enums:** defined once in `packages/contracts` (Zod) and mirrored as Postgres enums.

## 1. Entity overview

```mermaid
erDiagram
  users ||--o{ user_roles : has
  users ||--o{ sessions : has
  users ||--o{ batch_members : "assigned as"
  batches ||--o{ batch_members : has
  batches ||--o{ interns : contains
  batches ||--o| airtable_imports : "imported by"
  interns ||--o{ feedback : receives
  interns ||--o{ conversations : attends
  interns ||--o{ intern_status_events : history
  conversations ||--o{ feedback : delivers
  conversations ||--o{ comments : has
  feedback ||--o{ comments : has
  users ||--o{ feedback : writes
  users ||--o{ conversations : records
  users ||--o{ comments : writes
```

| Bounded context | Tables |
|---|---|
| identity | `users`, `user_roles`, `sessions` |
| cohort | `batches`, `batch_members` |
| intern | `interns`, `intern_status_events`, `airtable_imports` |
| feedback | `feedback`, `conversations`, `comments` |

## 2. Enums

| Enum | Values |
|---|---|
| `role` | `admin`, `mentor`, `program_manager` |
| `batch_member_role` | `mentor`, `program_manager` |
| `color_code` | `green`, `yellow`, `borderline_yellow`, `orange`, `borderline_red`, `red` |
| `intern_status` | `active`, `on_notice`, `graduated`, `terminated`, `withdrawn` |
| `feedback_state` | `draft`, `submitted`, `delivered` |
| `import_status` | `pending`, `completed`, `failed` |

Color codes have a fixed **severity order**, used for sorting and trend charts. This order lives in the contracts package, not in the database:

`green (1) → yellow (2) → borderline_yellow (3) → orange (4) → borderline_red (5) → red (6)`

"No color code" is stored as `NULL`.

## 3. Tables

### identity

**`users`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | citext | Unique, case-insensitive at the DB level. The app also trims and lower-cases it. |
| name | text | |
| google_sub | text null | Unique. Filled on first Google sign-in. |
| avatar_url | text null | From the Google profile |
| is_active | boolean | Default `true`. "Removing" a user sets this to `false`, which keeps their feedback and comments attributable. Inactive users cannot sign in, and deactivating a user also deletes their sessions. There is always at least one active admin. |
| last_login_at | timestamptz null | |
| created_at / updated_at | timestamptz | |

**`user_roles`**: global roles. A user must hold `mentor` or `program_manager` before they can be assigned to a batch in that capacity.
| Column | Type | Notes |
|---|---|---|
| user_id | uuid FK → users | |
| role | `role` | |
| granted_by | uuid FK → users null | `NULL` = granted by the system: the bootstrap admin seed, which acts only when no active admin exists |
| granted_at | timestamptz | |
| | | PK (`user_id`, `role`) |

**`sessions`**
| Column | Type | Notes |
|---|---|---|
| id | text PK | SHA-256 hash of the session token. The raw token exists only in the cookie. |
| user_id | uuid FK → users | Indexed, to revoke all of a user's sessions |
| expires_at | timestamptz | Sliding expiry: 7 days after last use, renewed once less than half is left, never more than 30 days after `created_at`. Indexed: expired rows are deleted on each sign-in. |
| user_agent / ip | text null | |
| created_at | timestamptz | |

### cohort

**`batches`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | citext | Unique, ignoring case |
| start_date | date | |
| end_date | date | Expected graduation date (about start + 18 months). Must be after `start_date` (check constraint). |
| is_archived | boolean | Default `false`. An archived batch is read-only. |
| created_by | uuid FK → users | |
| created_at / updated_at | timestamptz | |

**`batch_members`**: assignment history. Mentors come and go, so rows are never deleted. Unassigning a member sets `unassigned_at`.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| batch_id | uuid FK → batches | |
| user_id | uuid FK → users | |
| role | `batch_member_role` | |
| assigned_by | uuid FK → users | |
| assigned_at | timestamptz | |
| unassigned_at | timestamptz null | `NULL` means the assignment is current |
| unassigned_by | uuid FK null | |

Constraints:
- Partial unique (`batch_id`) where `role = 'program_manager' AND unassigned_at IS NULL`. This enforces **one PM per batch**.
- Partial unique (`batch_id`, `user_id`, `role`) where `unassigned_at IS NULL`. This prevents duplicate current assignments.
- There is no limit on how many batches a user belongs to, so **one PM can run many batches**.
- Checks: `unassigned_at` and `unassigned_by` are both null or both set, and `unassigned_at >= assigned_at`.
- Partial index on (`user_id`) where `unassigned_at IS NULL`, for the viewer's current batches (visibility scope).
- No foreign key cascades on `batches` or `batch_members`: batches are archived and users deactivated, never deleted, so a delete fails instead of erasing history.

### intern

**`interns`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| batch_id | uuid FK → batches | An intern belongs to exactly one batch |
| airtable_record_id | text null | Airtable record the intern was last imported from |
| username | citext | Unique within the batch (`batch_id`, `username`). Shown as `@username`. Re-imports match on it. |
| name | text | |
| email | text | Lower-cased |
| phone | text null | |
| diploma_branch | text null | |
| parent_names | text null | |
| interview_notes | text null | Markdown |
| airtable_fields | jsonb null | Raw snapshot of the Airtable record, for fields not modelled here ("etc.") |
| photo_public_id | text null | Cloudinary `public_id` |
| status | `intern_status` | Default `active`. **Denormalized**; the source of truth is `intern_status_events`. |
| color_code | `color_code` null | **Denormalized** current code. The source of truth is the latest submitted `feedback` with a code. |
| notice_ends_on | date null | Set while the intern is `on_notice` |
| created_at / updated_at | timestamptz | |

Index on (`batch_id`, `status`).

**`intern_status_events`**: append-only, never updated.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| intern_id | uuid FK → interns | |
| from_status | `intern_status` null | `NULL` for the initial `active` event at onboarding |
| to_status | `intern_status` | |
| reason | text | Markdown. Required for every change except onboarding. |
| notice_starts_on / notice_ends_on | date null | Required when `to_status = on_notice` |
| feedback_id | uuid FK null | The feedback marked as notice that started it, if any |
| actor_id | uuid FK → users | |
| created_at | timestamptz | |

**`airtable_imports`**: one row per import run. A batch can be imported many times.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| batch_id | uuid FK → batches | |
| base_id / table_id / view_id | text | Airtable source (`view_id` is nullable) |
| status | `import_status` | |
| record_count | int | |
| created_count / updated_count | int | Interns added and interns updated (matched by username) |
| errors | jsonb null | Per-record validation errors |
| imported_by | uuid FK → users | |
| created_at / completed_at | timestamptz | |

### feedback

**`feedback`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| intern_id | uuid FK → interns | |
| author_id | uuid FK → users | Mentor or PM of the intern's batch |
| period | date | First day of the month the feedback covers |
| body | text | Markdown |
| color_code | `color_code` null | `NULL` means "leave unchanged" |
| previous_color_code | `color_code` null | Snapshot taken at submission, so history reads as "orange → borderline_red" |
| gives_notice | boolean | Default `false`. When `true`, submitting the feedback puts the intern `on_notice` for one month in the same transaction. |
| state | `feedback_state` | `draft` → `submitted` → `delivered` |
| conversation_id | uuid FK null | Set when the feedback is delivered |
| submitted_at | timestamptz null | |
| created_at / updated_at | timestamptz | |

Indexes: (`intern_id`, `period`); (`intern_id`, `submitted_at`) where `color_code IS NOT NULL`.

**`conversations`**: a one-on-one in which the PM delivers one or more feedback entries.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| intern_id | uuid FK → interns | |
| recorded_by | uuid FK → users | The PM |
| held_on | date | |
| notes | text | Markdown: how it went and what new information came up |
| created_at / updated_at | timestamptz | |

**`comments`**: a flat thread on **either** a feedback entry or a conversation.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| feedback_id | uuid FK null → feedback | Set when the comment is on a feedback entry |
| conversation_id | uuid FK null → conversations | Set when the comment is on a conversation |
| author_id | uuid FK → users | |
| body | text | Markdown |
| created_at | timestamptz | |
| edited_at | timestamptz null | |
| deleted_at | timestamptz null | Soft delete. The UI shows "comment removed". |

Constraint: `CHECK (num_nonnulls(feedback_id, conversation_id) = 1)`, so each comment belongs to exactly one parent. Indexes: (`feedback_id`, `created_at`) and (`conversation_id`, `created_at`).

## 4. Domain rules (enforced in the domain layer)

**Color codes**
- A color code changes only when a feedback entry with a non-null `color_code` is **submitted**.
- On submit, the domain layer does three things in one transaction:
  - snapshots `previous_color_code`;
  - updates `interns.color_code`;
  - keeps the history derivable from `feedback`.
- An intern cannot be set back to "no code" once they have one.

**Feedback lifecycle**
- `draft`: visible and editable only by the author.
- `submitted`: visible to all current mentors and the PM of the batch. The author can still edit the text; the color code is fixed once submitted.
- `delivered`: immutable. Attached to a conversation.
- Several mentors can submit feedback for the same intern and month. The PM delivers them together in one conversation.
- Comments on feedback are allowed once it is `submitted`, and they stay open after delivery. A comment adds context without changing the original entry. Drafts cannot be commented on.

**Conversations**
- Only the batch's current PM can record a conversation. The PM picks which submitted feedback entries were delivered.
- Every current mentor and the PM of the batch can comment.

**Status transitions**

| From | To | Who | Trigger |
|---|---|---|---|
| — | `active` | Admin or PM | Onboarding / import |
| `active` | `on_notice` | Mentor or PM of the batch | Submitting feedback with `gives_notice = true`. Notice runs one month. |
| `on_notice` | `active` | PM | Notice lifted, with a reason |
| `on_notice` | `terminated` | PM | Notice period ended, with a reason |
| `active` | `graduated` | PM | Program completed, with a reason |
| `active` / `on_notice` | `withdrawn` | PM | Intern left, with a reason |

- `graduated`, `terminated`, and `withdrawn` are final. The intern becomes read-only.

**Access**
- Mentors and PMs see only batches where they have a **current** assignment (`unassigned_at IS NULL`).
- Admins see all batches.
- Inactive users cannot sign in.

## 5. Authorization matrix

| Action | Admin | PM (of batch) | Mentor (of batch) |
|---|:-:|:-:|:-:|
| Manage users and roles | ✅ | | |
| Create or archive batch | ✅ | | |
| Import interns from Airtable (repeatable) | ✅ | ✅ | |
| Assign or unassign mentors | ✅ | ✅ | |
| Assign PM | ✅ | | |
| View interns and submitted feedback | ✅ | ✅ | ✅ |
| Write feedback, set color code, mark as notice | ✅* | ✅ | ✅ |
| Record conversation | | ✅ | |
| Change intern status | | ✅ | |
| Comment on feedback or conversation | ✅* | ✅ | ✅ |
| Upload intern photo | ✅ | ✅ | ✅ |

\* An admin writes feedback or comments only if they are also assigned to the batch as a mentor or PM. Admin rights alone give read access to a batch, not write access to feedback.

## 6. Confirmed decisions

1. **Color code takes effect when feedback is submitted**, not when it is delivered. Mentors then share the current view right away. The intern hears about it at the next one-on-one.
2. **An intern cannot be terminated without first going through notice.** If immediate termination is needed, add `active → terminated`.
3. **Comments can go on both feedback entries and conversations.** For example, a mentor adds context to another mentor's feedback.
4. **Admins without a batch assignment are read-only** for that batch's feedback.
5. **Feedback is never deleted.** There is no delete endpoint or soft-delete column.
6. **Termination is manual.** `notice_ends_on` passing changes nothing by itself; the PM terminates or lifts the notice.
