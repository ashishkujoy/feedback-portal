# 10.3 Conversation API + UI — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/src/conversation.ts`, `feedback.ts` | **`RecordConversationRequest`** (10.2's content plus `feedbackId`, "Choose the feedback you went through in the 1:1."), **`ConversationView`** (who recorded it, the day, the notes, `editedAt`, and the feedback it delivered), and **`FeedbackView.deliveredOn`**. |
| `feedback/application/manage-conversations.ts`, `conversation-repository.ts`, `conversation-queries.ts` | **`recordConversation`:** access, then the feedback **locked** (`findByIdForUpdate`); someone else's draft or another intern's feedback is a 404; 10.2's domain; the conversation saved, then the feedback (which points at it). **`editConversation`** and **`listConversations`**. `ensureCanSee` and `internIn` are now shared from `manage-feedback.ts`. |
| `feedback/infrastructure/drizzle-conversation-*.ts`, `drizzle-feedback-repository.ts`, `drizzle-feedback-queries.ts`, `drizzle-feedback-admin.ts` | The conversation repository; the intern's conversations newest held first, with the recorder and the delivered feedback's author; `FOR UPDATE` on feedback; **`deliveredOn`** from a left join to the conversation. |
| `feedback/http/conversation.routes.ts`, `app.ts` | `GET`, `POST` and `PATCH …/interns/:internId/conversations[/:id]`; `Location` on 201; logs carry ids only. |
| `apps/web/src/api/conversations.ts` | The query (exact key) and the two mutations. |
| `interns/profile/record-conversation-dialog.tsx` | **A8:** radio cards, Date delivered (the UTC date by default), Delivered by, the Markdown editor for notes, the errors, A8-empty, and **its edit mode** with the feedback fixed. Saving refreshes the conversations and the feedback (exact keys). |
| `interns/profile/feedback-timeline.tsx`, `feedback-entry.ts`, `pages/intern-page.tsx` | **The conversation card** and its teal rail. **`timelineEntries`** (drafts first, then newest first by day, a conversation first on its day). **"Delivered 10 Oct"**. **Record conversation** on awaiting cards and **Edit** on conversations, for the batch's PM on a writable record. The feedback stays readable if conversations fail to load ("We couldn't load the conversations"). |
| `design/README.md` | "Conversations (A8, P6) as built in 10.3". |
| Test fixtures | Feedback fixtures gain `deliveredOn`; profile tests stub the conversations list. |

## How to verify
```sh
pnpm check     # contracts 82 + web 361 + api 681
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** Web 361 (+11), API 681 (+10). Format and lint clean, with no suppressions; no new dependencies. |
| API tests (10) | **Record:** 201 with `Location`; the feedback delivered with `deliveredOn`; another entry still awaiting; listed for a mentor. **The PM only:** a mentor, an admin assigned as mentor and an unassigned admin get 403; another batch's mentor 404; signed out 401; nothing saved. **Two records at once:** one 201, one 409 "This feedback has already been delivered.", one row. **Drafts:** your own draft gives 409 "A draft can't be delivered."; someone else's draft and unknown feedback give 404. **Content:** 11 Oct gives "Choose a date from 12 Oct 2026 to today."; blank notes and a bad id give both errors. **Archived** gives 409. **Edit:** unchanged isn't marked; changed gets `editedAt` and moves `deliveredOn`; a mentor 403; another intern's path 404; **after a PM change the new PM edits and the old one gets 404** (they no longer see the batch). **List:** newest held first. |
| Web tests (9 + 2) | **Timeline:** order (feedback, feedback, the conversation, the delivered entry); the card text, the link `#feedback-…`, Markdown; "Delivered 10 Oct" (success). **Buttons:** the PM gets Record conversation on the two awaiting cards and Edit on the conversation, nothing on the delivered entry; a mentor gets none. **A conversation load failure** shows the callout and keeps the feedback. **A8:** the description, two radios with the chosen one checked, today's date, Delivered by disabled; **saving** sends `{ heldOn, notes, feedbackId }` and refreshes; blank notes are refused before sending; the 409 shows with its sentence; **A8-empty.** **Edit:** no radios, the fixed feedback and its note, a `PATCH`, then "· edited". **Units:** same-day order, "Delivered 10 Oct". |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:** no lock on the feedback (the race test fails); mentors shown Record conversation (1); `deliveredOn` from the creation time (2); conversations after feedback on their day. **The last one survived at first** (the UI test's conversation was on a different day from the feedback), so unit tests for the order were added, and they catch it. |
| **A bug the tests found** | The radio's accessible name read "Meghna Bose· submitted…": the space inside the second span was dropped by name computation. The space now sits between the spans. |
| **Browser** (Compose, headless Chrome, test users only, then deleted) | Anjali's Borderline Red (12 Oct) and Vikram's no-colour entry (22 Oct). **As the PM:** both cards have Record conversation. A8 from Anjali's card is 560px, with Anjali's card chosen (ee-blue-50), 26 Oct by default and Delivered by Rajesh Menon, and matches v2's layout. **Saved:** the conversation card at the top ("recorded a conversation · 26 Oct 2026", "Delivers Anjali Deshpande’s feedback (12 Oct)", the Markdown list, Edit), Anjali's card shows "Delivered 26 Oct" with no button, and Vikram's still has Record conversation. **Edit:** the fixed card and its note, the date changed to 25 Oct, then "· edited" and "Delivered 25 Oct". The link points at Anjali's card. **As Vikram:** no conversation buttons; Edit on his own feedback only. Cleanup: test rows deleted (with triggers off for that transaction, since conversations can't otherwise be deleted); your batch untouched; all four triggers on; Chrome stopped. |

## Decisions & trade-offs
- **All four as recommended:** Record conversation on awaiting cards; conversations on the timeline now; Edit in A8's edit mode; the Markdown editor for notes.
- **The default date is the UTC date**, the API's "today". Between midnight and 05:30 in India it shows yesterday's date, which is always accepted.
- **A former PM gets 404, not 403,** when editing after a handover: they can no longer see the batch, as everywhere else.

## Deviations from plan
- None in behaviour.

## Not done / follow-ups
- **10.4–10.5:** comments, and the cards' Comment row.
- **10.6:** status changes on the timeline. **Phase 11:** A24's "Feedback to deliver" and P26.
