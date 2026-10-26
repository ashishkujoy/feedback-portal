# 10.2 Conversation domain — Plan

**Phase:** 10 — Conversations & comments
**Status:** Done

## Goal
Only the PM records a conversation; it delivers the chosen submitted feedback

## Done when
- **A `Conversation` aggregate** in the feedback module (`domain/conversation.ts`, with `ConversationId`). It holds its intern, `recordedBy`, `heldOn`, `notes`, timestamps and `editedAt`, mirroring 10.1's table.
- **`recordConversation`** returns the new conversation and the **delivered feedback** (9.2's `deliverFeedback`: `state = 'delivered'`, `conversationId`), for the caller to save in one transaction (10.3). It refuses:
  - **anyone but the batch's current PM** (decision 1): "Only this batch's programme manager records conversations.";
  - **feedback that isn't submitted:** a draft, or feedback already delivered ("This feedback has already been delivered." — one feedback per conversation, 10.1);
  - **feedback of another intern** (a caller bug, as 9.2 treats it);
  - **a read-only intern or an archived batch** (decision 4);
  - **blank notes**, or notes over 20,000 characters, with v2 A8's "Write how the conversation went.";
  - **a date out of range** (decision 2): "Choose a date from 12 Oct 2026 to today."
- **`editConversation`** changes the notes and date under the same rules, sets `editedAt` only when something changed (as 9.8 does), and never changes which feedback it delivered. Refused for anyone but the batch's current PM (decision 3), or for a read-only intern or archived batch.
- **Unit tests pass** (the roadmap's "Done when"); `pnpm check` passes. No database, HTTP or UI work: 10.3 saves, serves and shows it.

## Decisions
**All accepted as recommended.**

### (1) Who records — the batch's current PM only
DATA_MODEL's permissions table, PRODUCT ("the program manager … records the feedback conversation") and the precedent from status changes (7.6 decision: PM only) agree. v2's `canManage` would show the button to admins too, but 7.6 already settled that difference. **An admin records only when they are that batch's PM.** No answer needed unless you want admins to record.

### (2) The date delivered
v2's "Date delivered" is a date input that defaults to today.
**Recommended:** **from the day the feedback was submitted to today** (UTC days, as 9.3 decision 3 does for feedback). A 1:1 can't come before the feedback existed, nor in the future.

### (3) Who edits a conversation
You chose editable conversations (10.1 decision 2).
**Recommended:** **the batch's current PM**, whoever recorded it. When a batch changes PM, the new PM can still correct the record. The original recorder, if no longer the PM, can't. The notes and date can change, but not the feedback it delivered.

### (4) Read-only interns and archived batches
**Recommended:** **no recording and no editing**, as for feedback (9.2) and status changes (7.6). Nothing changes on a read-only record. So feedback still awaiting delivery when an intern leaves stays "Awaiting delivery". 10.3 shows no Record conversation button there.

## Plan
- **`feedback/domain/conversation-id.ts`:** `ConversationId`, `newConversationId`.
- **`feedback/domain/conversation.ts`:**
  - `Conversation`;
  - `recordConversation({ id, feedback, intern, actor, isProgramManager, content, today, now })` → `{ conversation, feedback }`;
  - `editConversation(conversation, { intern, actor, isProgramManager, content, deliveredFeedback, today, now })`.
  - The date range comes from the feedback's `submittedAt` (as a UTC date) and `today`.
- **`feedback/domain/feedback.ts`:** `deliverFeedback` takes a `ConversationId`. Its messages already cover drafts and delivered feedback.
- **Contracts:** `ConversationContentRequest` (`heldOn`, `notes`) for 10.3's form and API, shared like `FeedbackContentRequest`.

### Tests (Vitest, unit)
- **Recording:** a conversation with the given content; the feedback delivered with its id; the PM's id recorded.
- **Refusals:**
  - a mentor, an admin who isn't the PM, a former PM (403);
  - a draft or delivered feedback (409);
  - another intern's feedback;
  - a read-only intern; an archived batch (409);
  - blank or too-long notes, with the message;
  - a date before submission or after today, with the range message.
- **Editing:**
  - notes and date change, with `editedAt`;
  - unchanged gives no `editedAt`;
  - the current PM (not the recorder) can edit; the recorder after leaving can't;
  - read-only and archived refused;
  - the date rules again.
- **Mutations** (on copies, restored with `cp`, checked with `cmp`):
  - any member recording;
  - a delivered feedback delivered again;
  - the date check missing its lower bound;
  - `editedAt` set with no change.

### Out of scope
- **Saving, the API and the A8 dialog** (10.3).
- **Comments** (10.4–10.5).
- **Undoing a delivery.** A conversation's feedback never changes.

### Steps
1. `ConversationId`, the contract.
2. `recordConversation` and its tests.
3. `editConversation` and its tests.
4. `pnpm check`, mutations, `REVIEW.md`.

### Verification
- `pnpm check` exits 0; each mutation fails a test.
