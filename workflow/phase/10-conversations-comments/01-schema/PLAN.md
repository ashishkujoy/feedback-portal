# 10.1 Schema — Plan

**Phase:** 10 — Conversations & comments
**Status:** Done

## Goal
`conversations` and `comments` tables, with the one-parent check

## Done when
- **The `conversations` and `comments` tables** as DATA_MODEL §3 describes them, with the changes and checks below, in the **`feedback` module's schema** (DATA_MODEL §1 puts all three there).
- **The foreign key promised in 9.1:** `feedback.conversation_id` → `conversations`.
- **A migration** (`pnpm db:generate --name conversations_comments`) that applies to a fresh database and on top of the current one, with any trigger written in by hand, as 0003 and 0005 did.
- **Schema tests** (Testcontainers) for the defaults, every check, the foreign keys, the indexes and the triggers; `pnpm check` passes.
- **DATA_MODEL.md** matches what's built, including the 9.8 changes it hasn't caught up with (no `previous_color_code`; `edited_at`; editing submitted feedback).

## The tables
**`conversations`:** the one-on-one in which the PM delivers feedback (v2 A8 "Record conversation").

| Column | Type | Notes |
|---|---|---|
| id | uuid PK, `uuidv7()` | |
| intern_id | uuid FK → interns | |
| recorded_by | uuid FK → users | The PM, shown as v2's "Delivered by" |
| held_on | date | v2's "Date delivered" (a calendar date) |
| notes | text, not null | Markdown, v2's "Conversation notes" (required) |
| created_at / updated_at | timestamptz, default `now()` | |
| edited_at | timestamptz null | When its notes or date were changed after recording (decision 2), for an "edited" marker |

Index: (`intern_id`, `held_on`) for the intern's timeline (10.6).

**`comments`:** a flat thread on **either** a feedback entry or a conversation.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK, `uuidv7()` | |
| feedback_id | uuid FK null → feedback | |
| conversation_id | uuid FK null → conversations | |
| author_id | uuid FK → users | |
| body | text, not null | Plain text or Markdown (decided in 10.4) |
| created_at / updated_at | timestamptz, default `now()` | |
| edited_at | timestamptz null | v2's "· edited" |
| deleted_at | timestamptz null | Soft delete: v2's "This comment was deleted." |

Indexes: (`feedback_id`, `created_at`) where `feedback_id` is set, and (`conversation_id`, `created_at`) where `conversation_id` is set.

**No cascades,** as everywhere else.

## Checks
These are what the database can guarantee whatever the code does. Who may record or comment, and on what state of feedback, stay in the domain (10.2, 10.4).
- **One parent:** `num_nonnulls(feedback_id, conversation_id) = 1` (the roadmap's "one-parent check").
- **Notes are written:** `notes ~ '[^[:space:]]'`.
- **A comment has text unless deleted:** `deleted_at is not null or body ~ '[^[:space:]]'`.
- **A deleted comment isn't edited afterwards:** enforced by the trigger below.
- ~~**`edited_at` only after creation**~~ dropped while building: the database's clock and the app's can differ by a few milliseconds, so the check failed on genuine edits (see REVIEW).
- **On `feedback`:** the new foreign key on `conversation_id`. The existing check already ties it to `state = 'delivered'`.

## Decisions
Answered: (1) one conversation, one feedback; (2) **conversations are editable**; (3) and (4) as recommended.

### (1) How much feedback one conversation delivers — **one** (agreed)
DATA_MODEL says **one or more** ("The PM delivers them together in one conversation"). v2's A8 picks **one** with radio buttons ("Choose the feedback you went through in the 1:1").
**Recommended: follow v2 — one feedback per conversation**, with a unique index on `feedback.conversation_id`. Two pieces of feedback discussed in the same 1:1 become two short conversations, each with its own notes and comments. DATA_MODEL is reworded to match.
**Alternative:** several per conversation, as DATA_MODEL says. A8 would then need checkboxes, which v2 doesn't draw.

### (2) Conversations are editable, never deleted — **agreed: editable**
The notes and date can be changed after recording. The schema allows updates and records **`edited_at`**; who may edit (the PM who recorded it, or the batch's current PM) and the UI come with 10.2 and 10.3. **Deleting stays refused** by a trigger, as for submitted feedback, so a delivered entry always keeps its conversation.

### (3) What a soft delete keeps — agreed
**Recommended:** **the body is cleared** when a comment is deleted (`body = ''`, `deleted_at` set). "This comment was deleted." is then literally true, and nothing deleted can leak through an API or an export. A trigger refuses any change to a deleted comment, and refuses to hard-delete comments at all, so the thread keeps its shape.

### (4) Threads are flat — agreed
As DATA_MODEL and v2 draw them. PRODUCT's "the PM can reply" is a comment in the same thread, with no `parent_comment_id`.

## Plan
- **`modules/feedback/infrastructure/schema.ts`:** `conversations` and `comments`, with their checks and indexes; `feedback.conversationId` references `conversations.id`, plus the unique index (decision 1).
- **Migration** via `pnpm db:generate --name conversations_comments`, plus the triggers written in by hand:
  - `conversations_protect` refuses deletes;
  - `comments_protect` refuses deletes and any update of a deleted comment.
- **`schema.int.test.ts`** gets new cases:
  - defaults (`edited_at` empty);
  - a conversation's notes and date updated, with `edited_at`;
  - one parent (none, both, each alone);
  - blank notes; a blank comment, allowed once deleted;
  - the foreign keys (unknown feedback, conversation, intern, user);
  - one feedback per conversation;
  - the triggers (deleting a conversation or a comment; editing a deleted comment);
  - the feedback trigger still letting a submitted entry be delivered with a conversation.
- **`DATA_MODEL.md`:** the tables as built; decision 1's wording; the 9.8 catch-up (feedback lifecycle and colour rules, `edited_at`, no snapshot).

### Out of scope
- **The domain, API and UI** (10.2–10.6).
- **Linking status events to conversations** (PRODUCT §10.5 mentions it). No event comes from a conversation yet.

### Steps
1. Schema and migration, with its triggers.
2. Schema tests.
3. DATA_MODEL.md.
4. `pnpm check`, a mutation check, `REVIEW.md`.

### Verification
- The migration applies on a fresh database (Testcontainers) and on the Compose database.
- `pnpm check` exits 0.
- **Mutation check:** removing the one-parent check or a trigger makes a test fail.
