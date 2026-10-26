# 10.2 Conversation domain — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/feedback/domain/conversation.ts` (+ test) | **`Conversation`** (intern, `recordedBy`, `heldOn`, notes, timestamps, `editedAt`). **`recordConversation`** returns the conversation and the delivered feedback. It is refused for: anyone but the batch's current PM (403, decision 1); an archived batch (`batch_archived`) or a read-only intern (`intern_read_only`, decision 4); a draft ("A draft can't be delivered.", checked before the date, since a draft has none); feedback already delivered (`feedback_delivered`, "This feedback has already been delivered."); another intern's feedback (a caller bug); and content outside the rules. **`editConversation`** changes the notes and date for the batch's current PM, whoever recorded it (decision 3), under the same rules. With no change, it returns the same conversation and no `editedAt`. |
| `feedback/domain/conversation-id.ts` | `ConversationId`, `newConversationId`. |
| `feedback/domain/feedback.ts` (+ test) | `deliverFeedback` takes a `ConversationId`. |
| `packages/contracts/src/conversation.ts` (+ test) | **`ConversationContentRequest`:** `heldOn` ("Choose the date it was delivered.") and `notes` (non-blank, "Write how the conversation went."; at most 20,000), shared with 10.3's form. |
| `apps/api/src/shared/calendar-date.ts` | `dayLabel` ("12 Oct 2026") for the date message. |
| `DATA_MODEL.md` | The conversation rules: one feedback per conversation, the date range, who edits, nothing on read-only records. |

## How to verify
```sh
pnpm check     # contracts 82 + web 350 + api 671
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** Contracts 82 (+2), API 671 (+11). Format and lint clean, with no suppressions; no new dependencies. |
| Domain tests (11) | **Recording:** the conversation (recorded by the PM, no edit yet) and the feedback delivered with its id. Refused for: someone who isn't the PM (403 with the message); an archived batch; a terminated intern; a draft; feedback delivered twice; another intern's feedback (a caller bug); blank or 20,001-character notes; dates of 11 Oct and 25 Oct, with "Choose a date from 12 Oct 2026 to today.", while 12 and 24 Oct are accepted; and "20 Oct" as a date. **Editing:** the notes and date with `editedAt`; no change returns the same object; the current PM edits someone else's record; refused when not the PM, for a read-only intern, in an archived batch, and for a date after today. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:** any member recording (2 failing tests); delivered feedback delivered again (1); the date's lower bound removed (1); `editedAt` set with no change (1). |

## Decisions & trade-offs
- **All four decisions as recommended:** the PM only; dates from the submission day to today; the current PM edits; nothing on read-only records or archived batches.
- **The batch role is an input** (`{ isProgramManager, isArchived }`), as the use case finds it in 10.3, so the domain stays free of the database. The rule that only the PM may record still lives in the domain.
- **A draft is checked before the date:** a draft has no submission day, so the date check would otherwise answer first with a misleading message (the first run of the tests caught this).

## Deviations from plan
- None in behaviour. `editConversation` takes the delivered feedback's `submittedAt` (for the earliest date) instead of the whole feedback.

## Not done / follow-ups
- **10.3:** saving both in one transaction (the feedback's trigger allows `submitted` → `delivered` once), the API, and v2 A8.
