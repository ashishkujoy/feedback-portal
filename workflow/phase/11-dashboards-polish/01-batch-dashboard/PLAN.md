# 11.1 Batch dashboard — Plan

**Phase:** 11 — Dashboards & polish
**Status:** Done

## Goal
Color distribution, interns on notice, and feedback still to be delivered

## Done when
- **API: `GET /batches/:batchId/overview`**, for anyone who can see the batch (404 otherwise), returns:
  - **`colours`**: how many **current** interns have each colour, and how many have none. Current means not terminated or withdrawn, as v2's "Excludes terminated and withdrawn." says. Also `current` and `onNotice` totals.
  - **`onNotice`**: each intern on notice: id, name, photo, the notice's start and end, and **who issued it** (the actor of the change to On notice). Soonest ending first.
  - **`toDeliver`**: each submitted, undelivered feedback in the batch: its id, the intern (id, name, photo), the author, the submission time and the colour. Newest first, as v2 lists them.
- **The batch page's Overview tab** (v2 A24 / P24), **first** among the tabs for admins and the batch's PM. Mentors don't get it, as v2 draws.
  - **Colour distribution:** "65 current interns, including 4 on notice. Excludes terminated and withdrawn." There's a 16px bar of segments with 2px gaps. Under it, two columns of rows: dot and label (150px), a bar relative to the largest count, the count (bold) and the percentage.
  - **On notice** card: one row per intern, with avatar, name and "Ends 8 Nov 2026 · issued by Anjali Deshpande".
    - A running notice shows "**15 days left**", in red-700 when 7 or fewer.
    - An ended notice shows a warning badge, **Decision needed**.
  - **Feedback to deliver** card: "4 submitted" in the header. Each row has the avatar, the intern, "From Vikram Shetty · 22 Oct 2026 · waiting 2 days" and the colour chip.
    - The PM also gets **Record conversation** (outline, sm), which opens A8 for that feedback on this page.
  - The two cards sit side by side; names link to the intern's profile.
- **Empty and loading states** (decision 3), and a failed load shows "We couldn't load the overview".
- API, web and browser checks pass; `pnpm check` passes.

## Decisions
**All accepted as recommended.**

### (1) Which tab opens first
v2 puts Overview first for managers. **Recommended:** Overview is listed **first**, but **Interns stays the default** when the page opens. Links and habits built since 7.4 (`?tab=` absent means Interns) keep working, and the roster is still what most visits are for. Alternatively, Overview could be the managers' default.

### (2) The "Notice tracker" button
v2's On notice card has a ghost **Notice tracker** button that opens the batch's P5 tab, which isn't built and isn't in the roadmap. **Recommended:** leave the button out until P5 exists; each row links to the intern's profile instead.

### (3) States v2 doesn't draw
- **Nobody on notice:** "No one is on notice." (muted, in the card).
- **Nothing to deliver:** "No feedback is waiting to be delivered." (A8-empty's words).
- **No current interns:** the distribution card reads "No current interns yet." with no bar.
- **Waiting:** "waiting today" on the day it was submitted, then "1 day" and "N days", counted in UTC days as the API does.
- **Loading:** Kuat Skeletons in the cards' shapes.

### (4) Record conversation from the overview
v2 gives the PM **Record conversation** on each row. **Recommended:** open the same A8 dialog on the batch page, with that feedback chosen. The click loads the intern and their feedback, and the overview refreshes after saving, so the row disappears. The intern's own other awaiting feedback stays selectable, as on the profile.

### (5) Who sees the endpoint
**Recommended:** anyone who can see the batch (mentors too), since none of it is hidden from them elsewhere. Only the **tab** follows v2 and is shown to managers. That keeps one access rule instead of a new one.

## Plan
- **Contracts** (`batch-overview.ts`): `BatchOverview`.
- **API:**
  - the query `batch-overview` with three queries (the grouped colours over current interns; on-notice interns with the issuing event's actor; submitted feedback with intern and author);
  - the route on the batches router;
  - it lives in the intern/feedback read side, reached through the existing `batchAccess`, so the module boundaries stay as they are.
- **Web:**
  - `api/batch-overview.ts` (exact key);
  - `batches/overview/` with `colour-distribution.tsx`, `notice-card.tsx` and `deliver-card.tsx`;
  - the tab in `batch-page.tsx`;
  - A8 reused with a loader for the intern and their feedback;
  - after recording, refresh the overview (exact key) as well as the intern's feedback and conversations.
- **Docs:** `design/README.md` "Overview (A24 / P24) as built in 11.1"; the batch page's tab note.

### Tests
- **API:**
  - the colours count only current interns, with graduated included and terminated and withdrawn left out;
  - totals;
  - on notice ordered by end, with the issuer;
  - to deliver lists only submitted feedback (no drafts, no delivered), newest first, with intern and author;
  - another batch's data never appears;
  - 404 for a batch you can't see, 401 signed out.
- **Web:**
  - the tab for an admin and the PM but not a mentor, first in order, and Interns the default;
  - the distribution text, rows, counts and percentages;
  - notice rows with "days left" (red at 7), and Decision needed;
  - deliver rows with "waiting …" and the chip;
  - Record conversation for the PM only, opening A8 with that feedback and refreshing;
  - the empty states and the load error.
- **Mutations** (on copies, restored with `cp`, checked with `cmp`):
  - terminated interns counted;
  - delivered feedback listed;
  - the 7-day threshold;
  - the tab shown to mentors.
- **Browser** (Compose, headless Chrome, test users only, deleted afterwards):
  - a batch with mixed colours, an intern on notice and one whose notice ended, a terminated intern, and awaiting feedback;
  - check against v2 A24;
  - as the PM, record a conversation from the overview;
  - as a mentor, check there's no tab.

### Out of scope
- **The Notice tracker (P5)** and **Imports (A25)** tabs; **"My pending"** (11.2); the batch card's counts (7.8), which keep counting every intern.

### Steps
1. Contracts, the API query and route, and the API tests.
2. The tab, the three cards, and their tests.
3. Record conversation from the overview, and its tests.
4. Docs, `pnpm check`, mutations, the browser check, `REVIEW.md`.

### Verification
- `pnpm check` exits 0; the mutations fail tests; screenshots match v2 A24 apart from the decisions.
