# 9.8 Edit submitted feedback — Plan

**Phase:** 9 — Feedback
**Status:** Done

## Goal
Change anything in submitted feedback until it is delivered: text, month, colour (the intern follows if it is their latest coloured feedback) and notice (given or withdrawn, recorded in the status history), with an "edited" marker. Decided in 9.6 (decision 5).

## Done when
- **Who and when** (9.6 decision 5e): **the author only**, while the feedback is **Awaiting delivery**, and they still write feedback in the batch (its PM or a current mentor, not archived), for an intern who isn't read-only. Anyone else gets 403. Delivered feedback gets 409 `feedback_delivered`, as today.
- **`PATCH …/feedback/:id`** takes the full content (`FeedbackContentRequest`: month, text, colour, notice) instead of 9.3's text only, under the same rules as submitting:
  - **text** not blank;
  - **month** any the dialog offers, from the batch's start to this month (5d).
- **Colour** (5a): the entry takes the new colour, or none.
  - **The intern's colour is recalculated** as the colour of their newest submitted coloured feedback, or no colour if there is none. Editing an older entry leaves the intern's colour alone. Editing the newest one moves it. Changing the newest one to **No colour** gives the intern the colour from before it, even none.
  - **Each entry's "previous colour" is worked out when read**, from the coloured feedback before it, instead of being stored at submission (decision 1). So "Yellow → Orange" chips and the colour history stay right after an edit.
- **Notice on** (5b): as on submit, a one-month notice **from the day of the edit**, with a status-history entry "Notice given by editing the October 2026 feedback." that links to the feedback. Only for an **Active** intern ("This intern is already on notice." otherwise).
- **Notice off** (5c): **withdraws the notice this feedback gave**, putting the intern back to Active, with "Notice withdrawn by editing the October 2026 feedback.". The status history is append-only, so the original entry stays.
  - Only while **that** notice is still in force: the intern is on notice and the running notice came from this feedback.
  - Otherwise the switch is **locked on**: the PM lifted it, the internship ended, or a later notice replaced it. The dialog says "This notice was lifted on 12 Oct, so it can't be withdrawn here." (or ended or replaced). The API refuses a change with 409.
- **"· edited"** in the card's header after any change, as v2 marks edited comments ("gave feedback · 22 Oct 2026 · period Oct 2026 · edited"). This needs an **`edited_at`** column (5f), because delivery also moves `updated_at`.
- **The UI** (5e):
  - an **Edit** button (ghost-muted, sm, `pencil`) at the bottom left of the author's own Awaiting-delivery cards, where the rules above allow it;
  - it opens **9.5's dialog** as "Edit feedback for Ishita Rao", filled in, with **Cancel** and **Save changes** (no Save draft);
  - the notice box reads "Starts a one-month notice when you save." when switching on, and "Saving withdraws the notice this feedback gave." when switching off;
  - after saving, the timeline, side panel, colour history and header refresh.
- Domain, API and web tests, a browser check and `pnpm check` pass. The roadmap's "Done when" is "Domain and API tests pass".

## Decisions
**All accepted as recommended.**

### (1) "Previous colour" after an edit — accepted as recommended
Each feedback stores the intern's colour from just before it was submitted. That's what the timeline shows as "Borderline Red → Red". Editing an **older** entry's colour makes the **next** entry's stored value wrong. For example, with Yellow then Orange, changing the first to Green still shows "Yellow → Orange". Delivered feedback can't be corrected, because the database forbids changing it.
**Recommended:** **work it out when reading.** The list's query gives each coloured entry the colour of the coloured feedback submitted before it. The `previous_color_code` column is dropped in a migration, and the API's `previousColorCode` keeps its meaning, so the web is unchanged. It is always consistent, including for delivered feedback.
**Alternative:** keep the stored value and accept that the chain can jump after an edit of an older entry.

### (2) Withdrawing a notice that's no longer running
As decided in 9.6 (5c), the switch is **locked** with the reason instead of being turned off silently. **Recommended wording:**
- "This notice was lifted on \<date\>, so it can't be withdrawn here.";
- "\<first name\> left the programme on \<date\>." (the intern is read-only, so there is no Edit button at all);
- "A later notice replaced this one.".

### (3) The edited marker
**Recommended:** set `edited_at` only when something actually changes, so saving with no change doesn't mark the feedback as edited. Show "· edited" with no date, as v2 does for comments.

## Plan
- **Migration `0007`:** `feedback.edited_at timestamptz null`; drop `previous_color_code` and its check (decision 1).
- **Contracts:** `FeedbackView.editedAt`; the `PATCH` body becomes `FeedbackContentRequest`; `FeedbackBodyRequest` is removed.
- **Domain (`feedback.ts`):** `editSubmitted(feedback, { intern, actor, content, range, eventId, latestColour, now })` replaces 9.3's text-only one.
  - It checks the author, the state, the intern, the content and the notice rules.
  - It returns the feedback (with `editedAt` when anything changed) and the intern.
  - **The intern:** the colour is recalculated by the caller from the entries after the edit. Notice is given or withdrawn through the intern module's `giveNotice` and a new `withdrawNotice` (On notice → Active, with a reason and the feedback's id).
- **Intern domain:** `withdrawNotice`, and `followColour(intern, code | null)`, which can go back to none (only for the recalculation).
- **Repository and queries:**
  - `newestColour(internId)` (from the submitted coloured entries, after the save);
  - the list with `previousColorCode` from a `lag()` over coloured, non-draft entries by `submitted_at`;
  - `edited_at` saved and read.
- **Use case (`manage-feedback.ts`):** `editSubmittedFeedback`. It locks the intern, saves the feedback, then recalculates and saves the intern's colour, all in one transaction.
- **Web:**
  - `api/feedback.ts` gets `editFeedback`;
  - `give-feedback-dialog.tsx` gets an edit mode (title, Save changes, no Save draft, the notice lock and wording);
  - `feedback-timeline.tsx` gets the Edit button and "· edited";
  - `intern-page.tsx` gets the dialog state;
  - `can-edit-feedback.ts` holds the rule for showing Edit;
  - after saving, the feedback list, the intern and the batch's counts are refreshed (exact keys).
- **Docs:** `design/README.md` (Edit, "· edited", the notice lock); PRODUCT.md's feedback lifecycle (submitted feedback can be edited by its author until delivered).

### Tests
- **Domain:**
  - text, month, colour and notice changes;
  - author only; delivered refused; a read-only intern refused;
  - notice on from the edit day, with its event; notice on while on notice refused;
  - notice off withdraws, with its event; off after a lift, an end or a later notice refused;
  - no change leaves `editedAt` unset;
  - `followColour` back to none.
- **Queries:** the previous colour from the entry before; after an older entry's edit, the next one's previous colour follows; drafts and no-colour entries skipped.
- **API:**
  - the newest entry's colour moves the intern's;
  - an older entry's edit leaves it;
  - No colour on the newest gives back the one before, or none;
  - notice on and off with their status history (and the 9.6 trigger's append-only rule);
  - 403 for another mentor, 409 for delivered, 404 for someone else's draft;
  - the month range;
  - `editedAt` set;
  - a concurrent edit and submit for the same intern serialised by the lock.
- **Web:**
  - Edit only on the author's Awaiting-delivery cards;
  - the dialog filled in;
  - Save changes sends a `PATCH`;
  - the notice switch's wording and its lock with the reason;
  - "· edited";
  - the refreshes.
- **Mutations** (on copies, restored with `cp`, checked with `cmp`):
  - the intern's colour always following the edit;
  - notice off without checking that this feedback gave it;
  - `editedAt` set with no change;
  - the previous colour read as stored instead of from the entry before.

### Browser check (Compose, headless Chrome, test users only, deleted afterwards)
Three coloured entries and one with notice. Then:
- edit the newest's colour (the intern and the side panel follow);
- edit an older one (the next card's chip follows; the intern stays);
- switch notice off (Active, with the history entry), and on again (On notice, a new history entry);
- check the lock after the PM lifts a notice;
- check that another mentor sees no Edit button.

### Out of scope
- Editing delivered feedback (never), comments (10.4), and deleting submitted feedback (v2's Delete feedback stays unbuilt, 7.5 decision 6).
- An edit history of what changed. Only the marker is kept; the status history records notice changes.

### Steps
1. Migration, contracts, the intern domain's `withdrawNotice` and `followColour`, and the feedback domain's `editSubmitted` with its tests.
2. Repository, queries (`lag()`), the use case, the route, and their tests.
3. The web: Edit, the dialog's edit mode, "· edited", and their tests.
4. `pnpm check`, mutations, the browser check, `REVIEW.md`.

### Verification
- `pnpm check` exits 0; the mutations fail tests; screenshots match 9.5's dialog and 9.6's cards apart from the decisions.
