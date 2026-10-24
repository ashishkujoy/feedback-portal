# 9.5 Write feedback UI — Plan

**Phase:** 9 — Feedback
**Status:** Done

## Goal
Write feedback UI: period, body, color picker (with descriptions), and a "Mark as notice" switch

## Done when
- **The A7 dialog** (`interns/give-feedback-dialog.tsx`), 560px, **"Give feedback to Ishita Rao"**, "Visible to all mentors in \<batch\> once submitted. Drafts are visible only to you.":
  - **Feedback period** (required): a select, "Choose a month", with the months **from the current one back to the batch's start month**, newest first, **the current month chosen** (decision 3);
  - **Notice** beside it: a bordered box with **"Mark as notice"** and a **switch**. Its line says "Starts a one-month notice when you submit."; when on, "Ends 24 Nov 2026. \<PM\> then lifts it or terminates. Nothing happens automatically." (an Ember-tinted box); disabled for an intern already on notice, "Ishita is already on notice until 8 Nov 2026.";
  - **Colour code:** v2's seven-row radio list (No colour, Green, Yellow, Borderline Yellow, Orange, Borderline Red, Red), each with its dot, label and description ("Doing excellent work.", …, "At risk. Notice can be given."), the chosen row tinted; under it "Current code: Yellow. No colour keeps it. Once a code is set it can't go back to no colour." (or "No colour code yet." for an intern without one). **Switching notice on selects Red** (decision 2);
  - **Feedback** (required to submit): 9.4's `MarkdownEditor`, "What did you observe, and what should change?";
  - **Cancel** (ghost) on the left; **Save draft** (outline) and **Submit feedback** on the right ("Saving…" / "Submitting…").
- **Errors (A7-errors):** "Choose the month this feedback covers." and "Write your feedback before submitting." (submit only; a draft may be blank), with focus on the first. **A7-servererror:** an `issue` callout, "We couldn't submit your feedback" (or "save your draft"), "Your text is still here. Try again in a moment." plus the API's detail; everything typed stays.
- **Give feedback** (primary, `message-square`) in the **profile header** after the status buttons, and in the **empty timeline** ("No feedback yet"), for **current mentors and the PM** of a batch that isn't archived, **not for a read-only intern** (decision 1).
- **After Submit:** the dialog closes, and the profile (colour, notice banner, status), roster, batch and batches list refresh (exact keys). **After Save draft:** it closes; the draft appears in 9.6's timeline.
- The dialog also **opens an existing draft** (a `draft` prop: its values, `PUT` instead of `POST`), for 9.6's "Continue editing".
- Web tests and a browser check pass; `pnpm check` passes.

## Decisions needed

### (1) Where Give feedback appears now
v2 has it in the profile header, the empty timeline, and on **roster cards and table rows** (with "N feedback · date").

**Recommended:** the **profile header and the empty timeline** now. The roster's buttons come with the **feedback counts** they sit beside (a follow-up; the API doesn't count feedback yet), so a card doesn't show a half-built footer.

### (2) Notice and Red in the dialog
You agreed in 9.2 that any colour can go with notice. **Recommended:** switching notice **on** selects Red (v2's suggestion) and the author can change it; switching it **off** leaves the colour as it is.

### (3) The month list
**Recommended:** the current month (UTC, as the API checks) back to the batch's start month, **newest first, the current month chosen**. For a batch that hasn't started, the list is just its first month (the API allows from the start month only, so the dialog says "This batch starts in \<month\>." and disables Submit). *(Edge case; v2 doesn't show it.)*

### (4) Cancel with unsaved text
v2 has no "discard changes?" step. **Recommended:** none; Cancel closes, and Save draft is right beside it. Say if you'd rather be asked first.

## Plan
- **API client `api/feedback.ts`:** `feedbackQuery(batchId, internId)` (for 9.6), `createFeedback`, `updateDraft`.
- **UI:** `ui/switch.tsx` (Kuat Switch: 36×20, `--primary` when on) and a radio list in the dialog (native radios, Kuat's 18px style), both keyboard-operable.
- **`batches/can-write-feedback.ts`:** a current member (the PM or a current mentor) of a batch that isn't archived.
- **`interns/give-feedback-dialog.tsx`:** React Hook Form with `FeedbackContentRequest`; the editor through `Controller`; "Submit" adds the blank-text check; months and "today" from `utcToday`.
- **`pages/intern-page.tsx`:** the header button and the empty-timeline button (replacing 7.5's placeholder text), and the dialog.
- **`design/README.md`:** the as-built notes and decisions 1–4.

### Tests (Vitest, stubApi)
- **Who:** a mentor and the PM see Give feedback; an unassigned admin, an archived batch, and a read-only intern don't.
- **The form:** the title and description; months newest first with the current chosen; seven colour rows with descriptions and the help line; the notice switch's three lines; **notice on selects Red**, off leaves it.
- **Submit:** posts `{ period, body, colorCode, givesNotice, submit: true }`; blank text → the message and **no request**; the profile, roster and batch refetch; the dialog closes.
- **Save draft:** posts without `submit`, blank text allowed.
- **A server error:** the callout with the API's detail, the text kept.
- **An existing draft:** opens with its values and `PUT`s to its id.
- **Mutations** (on copies, restored with `cp`): the blank-text check removed; notice-on not selecting Red; the button shown to an unassigned admin; the refresh after submit removed. Each must fail a test.

### Browser check (Compose, headless Chrome, test users only)
- The dialog against v2 A7 (default, notice on, errors, server error), the switch and radios by keyboard, **undo after Bold (9.4)**; a submission with notice: the profile shows Red and the notice banner. Test data deleted afterwards.

### Out of scope
- **The feedback list on the timeline,** "Continue editing" and "Discard" (9.6).
- **Roster buttons and feedback counts** (decision 1), **M26 "My pending"**, the mobile screens (MM4).

### Steps
1. The API client, `Switch`, the access helper.
2. The dialog and its tests.
3. The profile buttons and their tests; `design/README.md`.
4. `pnpm check`, mutations, the browser check, `REVIEW.md`.

### Verification
- `pnpm check` exits 0; the mutations fail tests; screenshots match v2 A7 apart from the decisions.
