# 10.3 Conversation API + UI — Plan

**Phase:** 10 — Conversations & comments
**Status:** Done

## Goal
Pick the feedback, enter notes and date

## Done when
- **API** (the batch's PM writes; anyone who can see the batch reads):
  - **`POST /batches/:b/interns/:i/conversations`**: `{ feedbackId, heldOn, notes }` → 201 with the conversation. It saves the conversation and the delivered feedback in one transaction, with the feedback row locked, so two attempts can't both deliver it. The second gets 409 `feedback_delivered`.
  - **`PATCH …/conversations/:id`**: `{ heldOn, notes }` → 200 (10.2's edit rules).
  - **`GET …/conversations`**: the intern's conversations, newest first: who recorded each, the day held, the notes, `editedAt`, and the feedback it delivered (id, author, submission day).
  - **`FeedbackView.deliveredOn`**: the conversation's day, for v2's "**Delivered 10 Oct**" badge.
  - Errors follow 10.2: 403 for anyone but the PM, 409 for drafts, delivered feedback, archived batches and read-only interns, 400 for the content.
- **v2 A8 "Record conversation"** (560px dialog), as drawn:
  - the description "Ishita Rao · 2 submitted feedback awaiting delivery.";
  - **Feedback delivered** (required): one radio card per awaiting entry, showing "\<author\> · submitted 22 Oct 2026", the colour chip and a one-line excerpt, selected in ee-blue-50 with a primary border. The help reads "Choose the feedback you went through in the 1:1.";
  - **Date delivered** (date input, today) and **Delivered by** (the PM's name, disabled), side by side;
  - **Conversation notes** (required; "Markdown supported. Mentors in the batch can read this.");
  - **Cancel** and **Save conversation**;
  - **A8-empty:** "No feedback is waiting to be delivered" / "Feedback for Ishita appears here once a mentor submits it.", with Save disabled;
  - **A8-errors** for blank notes or no choice;
  - **A8-servererror:** "We couldn't save the conversation", with the API's sentence, for example when it was just delivered by someone else.
- **On the timeline** (decision 2): v2's **conversation entry**:
  - a 32px rail with `circle-check` on teal;
  - a slate-50 card: "**Rajesh Menon** recorded a conversation · 10 Oct 2026";
  - "Delivers **Anjali Deshpande's feedback (8 Oct)**", linking to that card;
  - the notes as Markdown.

  Delivered feedback shows **Delivered 10 Oct** (success). Feedback and conversations are mixed newest first.
- **Editing** (decision 3): the PM's **Edit** on a conversation card opens A8 as "Edit conversation". The delivered feedback is shown but can't be changed. **Save changes** marks it "· edited".
- API, web and browser checks pass; `pnpm check` passes.

## Decisions
**All accepted as recommended** (decision 1: (a), on each Awaiting-delivery card).

### (1) Where the PM records a conversation — needs your answer
v2 puts **Record conversation** only on the batch **Overview**'s "Feedback to deliver" (A24) and the PM's **To deliver** page (P26). Both are Phase 11 dashboards. The intern profile has no such button, so recording needs an entry point now.
- **(a) Recommended: on each Awaiting-delivery feedback card**, for the batch's PM: an outline sm **Record conversation** beside the Edit button's spot. It opens A8 with **that feedback chosen** (the other awaiting entries stay selectable, as A8 draws them). This matches DESIGN's A6 note ("Awaiting conversation with Record conversation for managers"), which v1 drew.
- **(b)** In the profile header, beside Lift notice and Terminate, opening A8 with nothing chosen.
- **(c)** Build A24's "Feedback to deliver" list now, ahead of Phase 11.

### (2) Conversations on the timeline now
10.6 "Unified intern timeline" adds comments and status changes. **Recommended:** conversations join the timeline **in 10.3**, using v2's card. Otherwise recording a conversation would show only a badge. Order: newest first by date, where a feedback entry's date is its submission and a conversation's is its day held. On the same day, the conversation comes first.

### (3) Editing a conversation
You chose editable conversations (10.1). v2 draws no edit. **Recommended:**
- the PM's **Edit** (ghost-muted, sm, `pencil`), as on feedback, at the bottom left of the conversation card;
- A8 reads "Edit conversation", with the delivered feedback as one fixed card (no radios) and **Save changes**;
- "· edited" after the date in the card's header.

### (4) The notes field
v2 draws a plain monospace textarea, while A7 (feedback) uses our Markdown editor. **Recommended:** **the same Markdown editor as A7**, with Write and Preview. Notes are Markdown, and one editor keeps the two dialogs alike.

## Plan
- **API (feedback module):**
  - `ConversationRepository` (save, find, find for update) and `FeedbackRepository.findByIdForUpdate`;
  - queries: the intern's conversations, and `deliveredOn` on feedback views;
  - use cases `recordConversation`, `editConversation`, `listConversations`, using 10.2's domain and `batchAccess` for `isProgramManager` and `isArchived`;
  - routes under `/batches/:b/interns/:i/conversations`;
  - contracts `RecordConversationRequest` (10.2's content plus `feedbackId`) and `ConversationView`.
- **Web:**
  - `api/conversations.ts`;
  - `interns/profile/record-conversation-dialog.tsx` (A8 and its edit mode);
  - the timeline's conversation card and Record conversation and Edit buttons;
  - the "Delivered 10 Oct" badge;
  - the page's state;
  - refreshes with exact keys: feedback, conversations, the intern.
- **Docs:** `design/README.md` (A8 as built, the entry point, the conversation card); DATA_MODEL if anything changes.

### Tests
- **API:**
  - record (201; the feedback is delivered and its badge date set);
  - the PM only (mentor 403, admin who isn't the PM 403, another batch 404, signed out 401);
  - a draft, delivered, archived or read-only → 409;
  - dates out of range and blank notes → 400;
  - two records of the same feedback at once → one 201 and one 409;
  - edit (`editedAt`; unchanged isn't marked; the current PM after a PM change);
  - list order and content.
- **Web:**
  - Record conversation only for the PM, only on awaiting cards;
  - A8 with the feedback chosen, the radios, the date defaulting to today, Delivered by;
  - Save sends the request and refreshes;
  - the errors and the empty state;
  - the conversation card, the link, and "Delivered 10 Oct";
  - Edit with the fixed feedback, and "· edited".
- **Mutations** (on copies, restored with `cp`, checked with `cmp`):
  - no lock on the feedback (the race test);
  - Record conversation shown to mentors;
  - `deliveredOn` from the wrong date;
  - the timeline order with conversations last.
- **Browser** (Compose, headless Chrome, test users only, deleted afterwards): as the PM, record a conversation for one of two awaiting entries, check A8 against v2, the card and badge, edit it, and check a mentor sees no buttons.

### Out of scope
- **Comments** (10.4–10.5) and their row on the cards ("No comments" / Comment).
- **Status changes on the timeline** (10.6).
- **A24 and P26** (Phase 11), and mobile.

### Steps
1. Contracts, repository, queries, use cases, routes, and API tests.
2. The A8 dialog and its tests.
3. The timeline card, badge, buttons, and their tests.
4. Docs, `pnpm check`, mutations, the browser check, `REVIEW.md`.

### Verification
- `pnpm check` exits 0; the mutations fail tests; screenshots match v2 A8 and P6's conversation card apart from the decisions.
