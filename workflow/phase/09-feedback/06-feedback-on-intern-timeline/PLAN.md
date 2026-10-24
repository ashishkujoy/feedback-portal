# 9.6 Feedback on intern timeline — Plan

**Phase:** 9 — Feedback
**Status:** Done

## Goal
Color change badges and notice flags

## Done when
- **The Timeline tab lists the intern's feedback** (`GET …/feedback`, 9.3's order: the viewer's own drafts first, then submitted entries newest first) in v2 P6's layout: a 32px rail icon with a line down to the next entry, and the entry beside it. The empty state (with Give feedback) stays for an intern with none.
- **A submitted entry** (v2's card): "**\<author\>** gave feedback · 22 Oct 2026 · period Oct 2026" (the submission day in the viewer's time zone, 9.3 decision 3), and a badge on the right: **Awaiting delivery** (info), or **Delivered** (success) once 10.x delivers it.
  - **The colour change badge:** the previous colour's chip, an arrow, then the new one (Borderline Red → Red). Only the new chip for an intern's first colour. **No colour** with "Colour code unchanged" for feedback without one (decision 2 covers the same colour again).
  - **The notice flag:** v2's **Notice** badge (error) beside the colours when the feedback gave notice.
  - **The body** through the sanitized Markdown renderer.
- **Edit on the author's undelivered feedback** comes in 9.8 (decision 5g).
- **The viewer's own draft** (v2's dashed card): "**Your draft** · only you can see this · edited 23 Oct", a **Draft** badge (neutral), a plain-text excerpt, then **Continue editing** (outline, sm), which opens 9.5's dialog on the draft, and **Discard** (ghost-muted, sm).
- **Discard** asks first (v2 **A26**): "Discard this draft?", "Your draft feedback for Ishita Rao (October 2026) is deleted. Only you could see it.", Cancel and **Discard draft** (destructive). Then `DELETE`, and the list refreshes. A refusal shows in the dialog.
- **The side panel's colour** says when it was set: "From the latest coloured feedback, 8 Oct 2026." (v2), from the list (decision 4).
- Loading shows a skeleton; a failed load shows "We couldn't load the feedback" with the API's detail.
- Web tests and a browser check pass; `pnpm check` passes.

## Decisions
**All accepted as recommended** (decision 5: anything can change until delivery, 5a–5g as recommended, so editing is task 9.8).

### (1) What the timeline holds in 9.6
v2's timeline mixes feedback, drafts, conversations, comments and status changes, with "Show earlier activity (7)" at the end.
**Recommended:** **feedback and the viewer's drafts only, all of them.** Conversations, comments and status changes join in 10.6 ("Unified intern timeline"), along with v2's "Show earlier activity" paging. Until then, status changes stay on the Status history tab. The card's **Comment** button and "N comments below" also wait for 10.5.

### (2) Feedback that keeps the same colour
The API records the previous colour on every submission. v2 only draws "No colour · Colour code unchanged" and "X → Y".
**Recommended:** when the colour is the **same as before** (Red again), show **one Red chip and "Colour code unchanged"**, not "Red → Red".

### (3) Drafts the author can no longer edit
A draft stays visible to its author after the batch is archived, the intern becomes read-only, or the author stops being a mentor, but the API then refuses edits.
**Recommended:** show the draft **without Continue editing and Discard** in those cases (the same rule as Give feedback), so no button leads to a refusal.

### (4) The side panel's "From the latest coloured feedback, \<date\>."
v2 adds the date. **Recommended:** add it now, from the newest submitted feedback with a colour, since the list is loaded anyway. Without such an entry (a colour from before, which can't happen today), it keeps today's wording.

### (5) Editing submitted feedback — **decided: anything can change until it's delivered**
Submitting already changed the intern (colour, and notice with its status-history entry), so an edit has to follow through. v2 draws none of this, so these need your answers:
- **(5a) The colour.** **Recommended:** the entry takes the new colour; **the intern's colour follows only if this is still their latest coloured feedback** (a newer one wins otherwise). Changing it to **No colour** puts the intern back to the colour from before this entry (`previous_color_code`), **even "none" if this was the first**, since it's a correction, not a reset.
- **(5b) Notice on.** **Recommended:** like submitting with notice: a one-month notice **from the day of the edit**, and a status-history entry "Notice given by editing the October 2026 feedback." Not possible while the intern is already on notice or read-only.
- **(5c) Notice off.** **Recommended:** **withdraws the notice this feedback gave**, back to Active, with a status-history entry "Notice withdrawn by editing the October 2026 feedback." (the history is append-only, so the original entry stays). **Only while that notice is still in force:** once the PM has lifted it or ended the internship, or a later notice replaced it, the switch is off with the reason.
- **(5d) The month:** any month the dialog offers for new feedback.
- **(5e) Who and where:** **the author only**, while **Awaiting delivery**, not for a read-only intern or an archived batch. An **Edit** button (ghost-muted, sm, `pencil`) at the bottom left of the card opens **9.5's dialog**, "Edit feedback for Ishita Rao", filled in, with **Cancel** and **Save changes** (no Save draft).
- **(5f) "· edited"** in the card's header after an edit, as v2 marks edited comments. This needs an `edited_at` column, because delivery also moves `updated_at`.
- **(5g) Where the work goes.** This is domain, API and migration work as well as UI. **Recommended:** **a new task, 9.8 "Edit submitted feedback"** (domain rules 5a–5c with their tests, the API, then the Edit button and dialog), so 9.6 stays the timeline. 9.6 then leaves room for Edit on the card, and 9.8 adds it.

## Plan
- **`api/feedback.ts`:** `discardFeedback` (`DELETE`, 204).
- **`interns/profile/feedback-timeline.tsx`:** the list, the rail, `FeedbackCard`, `DraftCard`; its loading and error states.
- **`interns/profile/feedback-entry.ts`:** pure helpers: the header line, period label ("Oct 2026"), the colour change (decision 2), the state badge, the draft excerpt (Markdown marks stripped, cut at a word near 160 characters with "…"), the latest coloured date.
- **`interns/profile/discard-draft-dialog.tsx`:** A26.
- **`pages/intern-page.tsx`:** the timeline in place of the placeholder (kept for an empty list); Continue editing opens `GiveFeedbackDialog` with `draft`.
- **`interns/profile/side-panel.tsx`:** the date (decision 4).
- **`design/README.md`:** as-built notes.

### Tests (Vitest, stubApi)
- **Order and content:** a draft first, then submitted entries newest first; the header lines, period, dates in the viewer's zone, the Markdown body (a `<script>` dropped).
- **Colours:** previous → new; first colour alone; No colour with "Colour code unchanged"; the same colour again (decision 2). **Notice** badge only on notice feedback. **Awaiting delivery** / **Delivered**.
- **Drafts:** "Your draft…edited", the excerpt, Continue editing opens the dialog with its text and `PUT`s; Discard asks, `DELETE`s, and the draft is gone; Cancel keeps it; a refusal shows. No buttons for a read-only intern (decision 3).
- **Side panel** date; the empty state still for no feedback; the load error.
- **Mutations** (on copies, restored with `cp`): the colour change dropping the previous chip; the Notice badge never shown; Discard not asking first; drafts sorted after submitted entries. Each must fail a test.

### Browser check (Compose, headless Chrome, test users only, deleted afterwards)
- A mentor's draft, a first coloured feedback, a change with notice, a no-colour entry: the cards against v2 P6, the side panel date, Continue editing → submit, Discard through A26, and another mentor not seeing the draft.

### Out of scope
- **Conversations, comments, status changes on the timeline and paging** (10.3–10.6, decision 1); **editing submitted feedback** (9.8, decision 5g).
- **The colour history strip** (9.7); the mobile screens (M6 / MM3).

### Steps
1. The helpers and their tests; `discardFeedback`.
2. The timeline, cards, A26, and the page; their tests.
3. The side panel; `design/README.md`.
4. `pnpm check`, mutations, the browser check, `REVIEW.md`.

### Verification
- `pnpm check` exits 0; the mutations fail tests; screenshots match v2 P6 apart from the decisions.
