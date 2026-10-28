# 10.6 Unified intern timeline — Plan

**Phase:** 10 — Conversations & comments
**Status:** Done

## Goal
Feedback, conversations, comments, and status events in date order

## Done when
Feedback, conversations (10.3) and comments (10.5) are on the timeline already. This task adds status changes and paging.
- **Status changes on the timeline** (v2 P6's status entry):
  - a 32px rail with `clock` on equal-ember-50 (ember-700);
  - "**Status changed** [Active] → [On notice] · Anjali Deshpande · 8 Oct 2026", with the badges as the Status history tab uses them;
  - under it, in 13px muted text, the reason (Markdown, as Status history shows it), plus "Runs until 8 Nov 2026." when it starts a notice (decision 2);
  - from the intern's `statusEvents`, already loaded with the profile, so no new API is needed.
- **Order:** everything newest first by the day where the viewer is. On the same day: comments, then status changes, then conversations, then feedback. A status change always follows what caused it: the feedback that gave notice and the status change share a day, and the change sits above (as v2 draws 8 Oct). Drafts stay first.
- **"Show earlier activity (N)"** (v2: outline, sm, under the last entry, indented 46px):
  - the newest **10** entries show at first (decision 3), drafts not counted;
  - each click shows 10 more, and N is how many are still hidden;
  - the rail line stops at the last shown entry.
- **Links to hidden entries:** a comment's or conversation's link to an entry that isn't shown yet reveals the entries down to it, then goes there (decision 4).
- **The empty state** (A6-nofeedback) shows only when there's nothing at all: no feedback, drafts, conversations, comments, or status changes beyond onboarding (decision 1).
- The Status history tab is unchanged.
- Web tests, mutations and a browser check pass; `pnpm check` passes.

## Decisions
**All accepted as recommended.**

### (1) Onboarding isn't on the timeline
Every intern's first event is "→ Active" ("Added by hand." / "Imported from Airtable."). v2's timeline has no such entry and starts at the first real change. **Recommended:** leave onboarding out. The Status history tab keeps it, and an intern with only that still gets "No feedback yet".

### (2) The note under a status change
v2 writes "Started by feedback marked as notice. Runs until 8 Nov 2026." We store the reason ("Notice given in the October 2026 feedback.", or the PM's reason for a lift, termination and so on). **Recommended:** the stored reason, as Status history shows it, with " Runs until 8 Nov 2026." added when it starts a notice. Writing a second set of wording for the timeline would let the two tabs disagree.

### (3) How much shows at first
v2 draws nine entries and "Show earlier activity (7)" without saying how many there are per page. **Recommended:** 10, then 10 more per click, all in the browser, since the data is loaded already. No API paging is needed: one intern's record over a programme stays in the low hundreds.

### (4) Links to hidden entries
A comment can link to feedback months back. **Recommended:** clicking such a link shows everything down to that entry and then scrolls to it, so the link never goes nowhere.

## Plan
- **`feedback-entry.ts`:**
  - `timelineEntries` takes status events, leaving out onboarding;
  - the same-day order becomes comments, status changes, conversations, feedback;
  - `statusNote(event)`.
- **`feedback-timeline.tsx`:**
  - the status entry;
  - paging state with "Show earlier activity (N)";
  - link clicks that reveal hidden entries.
- **`intern-page.tsx`:** pass `intern.statusEvents`; the empty state counts every kind of entry.
- **Docs:** `design/README.md` "The unified timeline (P6) as built in 10.6"; correct the 9.6 note.

### Tests
- **Units:**
  - the order with status changes (same day, above the feedback that gave notice);
  - onboarding left out;
  - the note with and without "Runs until";
  - the page slicing and N.
- **UI:**
  - a status entry's text, badges and note;
  - 10 shown, then "Show earlier activity (N)", then the next 10, then no button;
  - a link to a hidden entry reveals it;
  - the empty state with only onboarding;
  - an intern with no feedback but a status change shows the timeline.
- **Mutations** (on copies, restored with `cp`, checked with `cmp`):
  - onboarding shown;
  - status changes below their feedback;
  - the wrong N;
  - a link that doesn't reveal.
- **Browser** (Compose, headless Chrome, test users only, deleted afterwards):
  - an intern given notice by feedback, then lifted, with enough entries to page;
  - check the entries against v2 P6;
  - check the button and the link reveal.

### Out of scope
- API paging; filtering the timeline; mobile (MM3); notifications.

### Steps
1. Order, notes and paging helpers, and their tests.
2. The status entry, the button, the link reveal, and their tests.
3. Docs, `pnpm check`, mutations, the browser check, `REVIEW.md`.

### Verification
- `pnpm check` exits 0; the mutations fail tests; screenshots match v2 P6's status entry and "Show earlier activity", apart from the decisions.
