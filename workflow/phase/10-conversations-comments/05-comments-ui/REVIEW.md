# 10.5 Comments UI — Review

## What changed
| File | Notes |
|---|---|
| `apps/web/src/api/comments.ts` | The intern's comments query (exact key), and **add** (on feedback or a conversation), **edit** and **delete**. |
| `interns/profile/feedback-entry.ts` | `timelineEntries` takes comments: newest first by the day written, before what they follow on the same day. **`commentCounts`** (deleted included), **`commentNote`** ("No comments", "1 comment above"), **`feedbackLabel`**, **`conversationLabel`**. |
| `interns/profile/comment-form.tsx` | One form for both: the **composer** ("Add a comment" Input and a secondary Comment) and **edit in place** (a Textarea with Save and Cancel). "Write a comment." when blank, checked before sending; a refusal shows the API's sentence and keeps the text; focus starts in the field; Escape closes. |
| `interns/profile/comment-row.tsx` | The card's foot: its own buttons, **Comment** (ghost, sm) and the count; posting refreshes the comments (exact key) and closes the composer. |
| `interns/profile/comment-entry.tsx` | **The comment entry** (who, the link to its card, the date, "· edited", plain text with line breaks, or "This comment was deleted." in italics), the author's **Edit** and **Delete**, and **Delete this comment?** |
| `interns/profile/feedback-timeline.tsx` | Comment entries with a `message-circle` rail on slate-100. Feedback and conversation cards end in the comment row, **which now also holds Edit and Record conversation** (one footer instead of two rows). Conversation cards get an anchor for links. |
| `pages/intern-page.tsx` | The comments query; `canComment` (the feedback rule: the batch's mentors and PM, not archived, not read-only); the delete dialog; "We couldn't load the comments". |
| `ui/button.tsx` | Kuat's **secondary** variant (ee-blue-100 on brand blue), which v2's composer uses. |
| `design/README.md` | "Comments (P6) as built in 10.5"; the 9.6 note corrected. |
| Tests | Five profile test files stub `GET …/comments`; the 10.3 button test now expects Comment on every card. |

## How to verify
```sh
pnpm check     # contracts 84 + web 379 + api 708
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** Web 379 (+18). Format and lint clean, with no suppressions; no new dependencies. |
| Units (4) | Comments newest first by day, before their parent on the same day, across feedback and a conversation. Counts per parent, deleted included. "No comments" / "1 comment above" / "3 comments above". The feedback and conversation labels. |
| UI (14) | **Entries:** the order with feedback and conversations; the links (`#feedback-…`, `#conversation-…`) and their labels; the date; "· edited"; line breaks kept; the deleted comment in italics. **Counts** on feedback and conversation cards. **Edit and Delete** only on the viewer's own live comments. **No buttons** (comments still shown) for an unassigned admin, a read-only intern and an archived batch. **A load failure** shows the callout and keeps the rest. **Composer:** opens with focus and the placeholder; posts `{ body }` as typed to `…/feedback/:id/comments`, refreshes and closes; on a conversation posts to `…/conversations/:id/comments`; blank shows "Write a comment." (as the Input's description) and sends nothing; a 409 shows its sentence and keeps the text. **Edit:** the text in place with focus, `PATCH { body }`, closes; Cancel restores; unchanged sends nothing. **Delete:** asks with the dialog's text; Cancel sends nothing; Delete sends `DELETE`, refreshes and closes. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **5, all caught:** Edit and Delete on others' comments (1 test); comments after their parent on the same day (1); Delete without asking (1); the count ignoring deleted comments (2); every comment counted on each card (5). |
| **A bug the tests found** | Editing in a one-line Input dropped a comment's line breaks ("PAY-214.Tests are in."), so saving would have quietly rewritten it. The edit field is now a Textarea. |
| **Browser** (Compose, headless Chrome, test users only, then deleted) | **As Vikram (mentor):** the composer opens under his card with focus ("Add a comment"), the row's Comment is ghost (brand blue on transparent, 32px) and the composer's is secondary (ee-blue-100, 36px); his comments on his feedback and on Rajesh's conversation appear at the top, "commented on Vikram Shetty’s feedback (22 Oct)" / "Rajesh Menon’s conversation (24 Oct)"; Edit gives a Textarea with focus, and Save marks "· edited"; Delete asks in a 460px dialog, then shows "This comment was deleted." in italics; counts read "2 comments above", "1 comment above", "No comments"; the rail is slate-100. **As Anjali:** Edit and Delete on her comment only. **As Rajesh (PM):** Edit and Record conversation sit in the comment row. **A withdrawn intern:** the comment shows, with no buttons. Cleanup: test rows deleted; your batch untouched (61 interns); both triggers on; Chrome stopped. |

## Decisions & trade-offs
- **All five as recommended:** comments as timeline entries; "above"; the feedback rule for who comments; edit in place and delete with a confirmation; comments on conversations.
- **Edit uses a Textarea, the composer an Input** (as v2). The API stores comments as typed, so editing must not lose line breaks; new comments from the Input are one line.
- **One footer row per card:** Edit (9.8) and Record conversation (10.3) used to sit in their own row above the new comment row. Two rows of buttons looked heavy, so they now open the comment row, in the same order.
- **A comment whose parent isn't loaded** (its conversation failed to load) reads "commented on an entry", with no link.

## Deviations from plan
- The edit field is a Textarea, not an Input (see the bug above).
- The card's buttons were moved into the comment row (above).
- Kuat's secondary Button variant was added; v2's composer uses it.

## Not done / follow-ups
- **10.6:** status changes on the timeline and "Show earlier activity".
- **Mobile** (MM5's thread) and notifications.
