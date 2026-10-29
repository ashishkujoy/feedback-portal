# 11.2 "My pending" view — Plan

**Phase:** 11 — Dashboards & polish
**Status:** Done

## Goal
For mentors: interns with no feedback this month. For the PM: submitted feedback not yet delivered.

## Done when
- **API: `GET /me/pending`** for the signed-in user, across the batches where they're a **current mentor or PM**. Archived batches and batches that haven't started are left out. It returns:
  - **`month`**: this month (UTC, as feedback periods are), e.g. `2026-10-01`.
  - **`needsFeedback`**: each active or on-notice intern who has **no submitted feedback from you** for this month (decision 1). Each row has the intern (id, name, photo, colour), its batch (id, name), and **the last submitted feedback** by anyone (day and author, or none). Sorted by batch, then name.
  - **`drafts`**: your drafts in those batches: intern, batch, period, colour, a text excerpt, and when it was last edited. Newest first.
  - **`toDeliver`**: for batches where you're the **PM**, the 11.1 list (submitted, undelivered, for interns whose record can change), with the batch. Newest first.
- **The sidebar's "My pending"** (v2: an inbox icon) sits under Batches, with a Kuat CounterBadge.
  - For a PM, the badge counts **To deliver**; for anyone else, **Needs feedback** (decision 2).
  - There's no badge at 0.
  - Admins who aren't assigned anywhere still see the item, and their lists are empty.
- **The page `/pending`** (v2 M26 / P26):
  - **Title and subtitle:** "My pending", with v2's subtitle for the role. The PM's reads "Feedback waiting for you to deliver, and interns without feedback this month."; anyone else's reads "Interns in your batches with no feedback for October 2026, and your drafts.".
  - **Tabs:** a PM gets **To deliver**, **Needs feedback** and **Drafts**; anyone else gets **Needs feedback** and **Drafts**. Each has its count. The first tab opens by default (`?tab=` otherwise).
  - **Needs feedback** is a table with the columns Intern (avatar and name, linking to the profile), Batch, Colour code (chip) and Last feedback ("18 Sep 2026 · Sana Qureshi", "· you" for your own, "No feedback yet"). Each row has **Give feedback** (ghost, sm), which opens A7 for that intern on this page.
    - The footer reads "12 interns" (decision 3).
    - Empty, it shows **"You're up to date"** / "Every intern in your batches has feedback from you for October 2026."
  - **Drafts** are v2's dashed cards: avatar, intern, "\<batch\> · period Oct 2026 · edited 23 Oct", chip, a one-line excerpt, then **Continue** (outline, opens A7 on the draft) and **Discard** (ghost-muted, A26). Empty, it says "No drafts." (decision 4).
  - **To deliver** is a table with the columns Intern, Feedback by, Submitted, Colour code, Waiting ("2 days") and **Record conversation** (outline, sm, opening A8 here, as 11.1 does). Empty, it says "No feedback is waiting to be delivered."
  - A failed load shows "We couldn't load your pending work"; Skeletons show while loading.
- **Refreshes:** giving feedback, saving or discarding a draft, and recording a conversation all refresh the pending list and the badge.
- API, web and browser checks pass; `pnpm check` passes.

## Decisions
**All accepted as recommended.**

### (1) "No feedback this month": from whom
PRODUCT says "Each month, mentors record feedback for each intern." **Recommended:** an intern needs **your** feedback until **you** have submitted feedback for this month's period. A draft doesn't count, and another mentor's feedback doesn't clear it. The Last feedback column still shows the latest from anyone, as v2 does ("18 Sep 2026 · Sana Qureshi"). The alternative is to clear an intern once anyone has given feedback for the month.

### (2) The badge
v2 counts To deliver for a PM and Needs feedback for a mentor. **Recommended:** the same. A PM who is also a mentor in another batch sees the PM count, with both lists on the page.

### (3) "Showing 8 of 12"
v2's footer suggests paging, but every row fits on one page. **Recommended:** show all the rows, with the footer "12 interns".

### (4) States v2 doesn't draw
- **Empty Drafts:** "No drafts."
- **Empty To deliver:** "No feedback is waiting to be delivered."
- **Last feedback with none:** "No feedback yet".

### (5) Give feedback from the list
**Recommended:** open the same A7 dialog on this page, after loading the intern and batch. If you already have a draft for that intern, the dialog opens on it (as Continue would), so you don't start a second one.

## Plan
- **Contracts** (`pending.ts`): `MyPending`.
- **API:**
  - in the feedback module, `pending-queries` with three reads scoped by the user's current memberships (from the cohort tables, read-only as other queries do);
  - the use case `myPending` and `GET /me/pending` (signed in; no batch id).
- **Web:**
  - `api/pending.ts` (exact key);
  - the nav item with the badge;
  - the `/pending` route and `pages/pending-page.tsx` with three panels (`pending/needs-feedback.tsx`, `drafts.tsx`, `to-deliver.tsx`);
  - a shared loader that opens A7 or A8 for a row;
  - refreshing the pending key after each change.
- **Docs:** `design/README.md` "My pending (M26 / P26) as built in 11.2".

### Tests
- **API:**
  - needs feedback leaves out:
    - interns you gave this month's feedback;
    - interns that are read-only;
    - archived batches;
    - batches not yet started;
    - batches you've left.
  - Someone else's feedback this month doesn't clear an intern, and your draft doesn't either. The last feedback is from anyone.
  - Drafts are yours only.
  - To deliver covers only batches where you're the PM.
  - Ordering; signed out gives 401.
- **Web:**
  - the nav badge for a PM and a mentor, with none at 0;
  - the tabs and default per role;
  - the needs table, the "you" wording, Give feedback opening A7 (and the existing draft);
  - Drafts Continue and Discard;
  - To deliver Record conversation;
  - the empty states, loading and the error;
  - refreshes after each change.
- **Mutations** (on copies, restored with `cp`, checked with `cmp`):
  - another mentor's feedback clearing an intern;
  - archived batches included;
  - to deliver from a batch where you're only a mentor;
  - the badge counting the wrong list.
- **Browser** (Compose, headless Chrome, test users only, deleted afterwards):
  - as a mentor: Needs feedback, give feedback from the list (the row goes), a draft to continue and discard;
  - as the PM: To deliver and record a conversation (the row and the badge update);
  - check against v2.

### Out of scope
- **Mobile** (MM6), notifications, and 11.3–11.4.

### Steps
1. Contracts, the API queries and route, and the API tests.
2. The nav item and badge, the page and its three panels, and their tests.
3. Give feedback, Continue, Discard and Record conversation from the lists, and their tests.
4. Docs, `pnpm check`, mutations, the browser check, `REVIEW.md`.

### Verification
- `pnpm check` exits 0; the mutations fail tests; screenshots match v2 M26 and P26 apart from the decisions.
