# 10.1 Schema — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/feedback/infrastructure/schema.ts` | **`conversations`:** intern, `recorded_by` (the PM), `held_on`, notes (non-blank), timestamps and **`edited_at`** (decision 2). Index (`intern_id`, `held_on`). **`comments`:** `feedback_id` or `conversation_id`, author, body, timestamps, `edited_at`, `deleted_at`. The **one-parent check**; a non-blank body unless deleted; partial indexes per parent. **`feedback.conversation_id` now references `conversations`**, with a **unique index**: one conversation delivers one feedback (decision 1). |
| `apps/api/drizzle/0009_conversations_comments.sql` (+ snapshot, journal) | Generated, plus two hand-written triggers (as 0003 and 0005 did). **`conversations_protect`** refuses deletes. **`comments_protect`** refuses deletes and any update once `deleted_at` is set (decision 3). |
| `schema.int.test.ts` | Delivered feedback now has a real conversation each (the new key). New tests: conversations (defaults, notes, editing, never deleted, keys, one feedback each) and comments (one parent, text unless deleted, soft delete then frozen, keys). |
| `feedback.routes.int.test.ts` | 9.8's delivered-feedback test records a real conversation first. |
| `DATA_MODEL.md` | The two tables as built; one feedback per conversation; the unique key. **The 9.8 catch-up:** no `previous_color_code` (the previous colour is worked out when read), `edited_at` on feedback, the author editing submitted feedback, and the colour rules. |

## How to verify
```sh
pnpm check     # contracts 80 + web 350 + api 660
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** API 660 (+10). Format and lint clean, with no suppressions; no new dependencies. |
| Schema tests (22) | **Conversations:** a uuid v7, the date and no edit by default; blank notes refused; notes and date updated with `edited_at`; **delete refused** (`restrict_violation`), and the row stays; unknown intern or user refused. **One feedback per conversation:** a second delivered entry with the same conversation hits `feedback_conversation_unique`; an unknown conversation is refused. **Comments:** on feedback or a conversation; **no parent or both parents** refused by `comments_parent_check`; blank text refused unless deleted; edited, then soft-deleted (body cleared), then **any change or a delete refused**; unknown feedback, conversation or author refused. The 9.1 cases still pass with real conversations. |
| **Mutations** (on a copy of the migration, restored with `cp`, checked with `cmp`) | **4, all caught:** the one-parent check loosened (1 failing test); the conversation trigger removed (1); a deleted comment editable (1); the unique index made plain (1). The first try at the trigger mutation moved it onto comment inserts, which failed five unrelated tests too, so it was rerun by just removing the trigger, which fails "is never deleted" alone. |
| Compose database | The migration applied on top of your data. `conversations` and `comments` exist, both new triggers are there, and the 61 Dhurandhar interns are untouched. |

## Decisions & trade-offs
- **(1) One feedback per conversation** (your answer), enforced by the unique index.
- **(2) Conversations are editable** (your answer): `edited_at` is there, and who edits comes in 10.2 and 10.3. Deleting stays refused.
- **(3) A soft delete clears the text** and freezes the comment. **(4) Flat threads.**

## Deviations from plan
- **No "edited after created" checks.** The plan had `edited_at >= created_at` on both tables. In the tests the database's clock ran about 20 ms ahead of the app's, so an edit time set by the app came out earlier than a creation time set by the database, and real edits failed. The same could happen in production, so the checks were dropped and the migration regenerated before it was applied anywhere.

## Not done / follow-ups
- **10.2:** the conversation domain (only the PM records; delivering the chosen submitted feedback; who may edit).
- Linking status events to conversations (PRODUCT §10.5) when a conversation first changes a status.
