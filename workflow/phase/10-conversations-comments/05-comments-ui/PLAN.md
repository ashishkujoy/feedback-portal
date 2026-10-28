# 10.5 Comments UI — Plan

**Phase:** 10 — Conversations & comments
**Status:** Done

## Goal
A thread under each feedback entry and each conversation

## Done when
- **The card's comment row** (v2 P6), at the foot of each submitted or delivered feedback card:
  - **Comment** (ghost, sm) for anyone who can comment (decision 3);
  - a muted count: "No comments", "1 comment" or "3 comments", with where they are (decision 2).
- **The composer** (v2 P6): **Comment** opens an "Add a comment" Input and a secondary **Comment** button under the row, with focus in the Input.
  - Posting sends the text as typed and refreshes the comments. The composer then closes.
  - A blank comment shows "Write a comment." under the Input and sends nothing.
  - A refusal shows the API's sentence there, and the text stays.
- **Comments on the timeline** (decision 1, as v2 draws them): each comment is its own entry with a 32px rail (`message-circle` on slate-100) and:
  - "**Joel Fernandes** commented on **Vikram Shetty’s feedback (22 Oct)** · 23 Oct 2026", the link going to that card, and "· edited" once changed;
  - the text as plain text, line breaks kept;
  - a deleted one in muted italics: "This comment was deleted.";
  - **Edit** and **Delete** (ghost-muted, sm) on the viewer's own live comments, while they can still comment.
- **Editing** (decision 4): the text becomes the same Input, with **Save** and **Cancel**. Saving an unchanged text closes it with no "· edited".
- **Deleting** (decision 4) asks first, in a 460px Kuat Dialog, as A26 does for drafts:
  - "Delete this comment?";
  - "It will show as “This comment was deleted.” to everyone in the batch.";
  - **Cancel** and a destructive **Delete**.
- **Conversations** (decision 5) get the same comment row and composer. Their comments read "commented on **Rajesh Menon’s conversation (10 Oct)**".
- **Order:** comments join the timeline by the day they were written, newest first. On the same day a comment comes before the feedback or conversation it follows.
- **Read-only intern, archived batch, a viewer who isn't a mentor or PM:** comments show, with no Comment, Edit or Delete.
- **A failed comments load** shows "We couldn't load the comments" and keeps the rest of the timeline.
- Web tests, mutations and a browser check pass; `pnpm check` passes.

## Decisions
**All accepted as recommended** (decision 1: (a), comments as their own timeline entries, as v2 desktop draws them).

### (1) Where comments show
The roadmap says "a thread under each entry", but v2's desktop P6 draws comments as **their own timeline entries** ("Joel Fernandes commented on Vikram Shetty’s feedback (22 Oct) · 23 Oct 2026"). The card then has only the Comment row and a count. Only the mobile MM5 draws a thread inside the feedback.
- **(a) Recommended: as v2 desktop draws it:** comments are timeline entries, newest first, linking to their card. This brings that part of 10.6 forward, as 10.3 did for conversations. 10.6 is then left with status changes and "Show earlier activity".
- **(b) A thread inside each card,** oldest first, under the body and above the composer, like MM5. This doesn't follow the desktop layout.

### (2) The count's wording
v2 writes "1 comment below", but on a newest-first timeline a comment is always written after its parent, so it sits **above** the card. **Recommended:** "1 comment above" / "3 comments above", and "No comments".

### (3) Who comments
These are the API's rules (10.4). The batch's **current mentors and PM** can comment, and an admin only when assigned. That is the same rule as Give feedback (`canWriteFeedback`). Nobody can comment in an archived batch or on a read-only intern's record. **Edit and Delete appear on your own live comments only, under the same conditions.**

### (4) Editing and deleting — not drawn in v2
v2 draws the Edit and Delete buttons but no edit form or confirmation. **Recommended:**
- **Edit** puts the text into an Input in place, with **Save** (secondary, sm) and **Cancel** (ghost-muted, sm).
- **Delete** asks first, in a dialog like A26's "Discard this draft?". The comment stays on the record as "This comment was deleted.", so a confirmation stops it happening by accident.

### (5) Comments on conversations
v2's conversation card has no Comment row, but DATA_MODEL allows comments on conversations (decision 3). **Recommended:** the same row and composer on conversation cards, so mentors can respond to what came up in the 1:1.

## Plan
- **API client** (`api/comments.ts`): the intern's comments query (exact key), plus add (on feedback or a conversation), edit and delete mutations. Each refreshes the comments with the exact key.
- **Timeline:**
  - `feedback-entry.ts`: `timelineEntries` takes comments, with comments ranked first on their day;
  - `commentCount(parent)` and the "on" label;
  - `conversationAnchor` for links.
- **Components** in `interns/profile/`:
  - `comment-row.tsx`: the count, the Comment button and the composer;
  - `comment-entry.tsx`: the timeline entry, its Edit mode, and Delete with its dialog;
  - wired into the feedback and conversation cards and the timeline.
- **Page** (`intern-page.tsx`): the comments query, `canComment` (`canWriteFeedback` and not final), and the load failure.
- **Docs:** `design/README.md` "Comments (P6) as built in 10.5"; correct its 9.6 note.

### Tests
- **Units:** the order with comments (same-day before the parent; across days); the count wording; the "on" labels for feedback and conversations.
- **UI:**
  - the row and count on feedback and conversation cards;
  - the composer posts `{ body }` to the right path and refreshes;
  - a blank comment is refused before sending; a 409 shows its sentence and keeps the text;
  - the entry text, link, "· edited" and deleted state;
  - Edit saves through `PATCH`, and Cancel restores the text;
  - Delete asks, then sends `DELETE`, and Cancel sends nothing;
  - no buttons for a non-member, a read-only intern or an archived batch, and no Edit or Delete on others' comments;
  - the load-failure callout.
- **Mutations** (on copies, restored with `cp`, checked with `cmp`):
  - Edit and Delete shown on others' comments;
  - comments after their parent on the same day;
  - delete without asking;
  - the count ignoring deleted comments, or counting the wrong parent.
- **Browser** (Compose, headless Chrome, test users only, deleted afterwards):
  - as a mentor, comment on feedback and on a conversation;
  - edit and delete;
  - check against v2 P6;
  - as another mentor, check there's no Edit or Delete on others' comments;
  - on a read-only intern, check there's no Comment.

### Out of scope
- **Status changes on the timeline** and "Show earlier activity" (10.6).
- **Mobile** (MM5) and notifications.

### Steps
1. API client, timeline order, labels and their tests.
2. The comment row and composer, and their tests.
3. The comment entry, Edit and Delete, and their tests.
4. Docs, `pnpm check`, mutations, the browser check, `REVIEW.md`.

### Verification
- `pnpm check` exits 0; the mutations fail tests; screenshots match v2 P6's comment row, composer and comment entry, apart from the decisions.
