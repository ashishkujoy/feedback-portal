# 6.5 Batches UI — Plan

**Phase:** 6 — Batches (cohort)
**Status:** Done

## Goal
Batch list, create-batch form, and a batch page showing current and past members

## Done when
- **`/batches`** shows the design's batch cards (A1/P1/M1) for the batches the viewer can see (6.4), titled "Batches", or "My batches" for mentors.
- **Admins can create a batch** in the design's dialog (A9), validated with the shared `CreateBatchRequest`.
- **`/batches/$batchId`** shows the batch's header and its members, **current and past**.
- Tests cover these. `pnpm check` passes, and the pages match the design's measurements in the browser.

## What the design shows
- **A1 Batches**:
  - **Header row:** the title, and under it a 14px muted subtitle: "4 batches · 1 active, 1 upcoming", or for a mentor "2 batches assigned to you". On the right, the primary **Create batch** button (`plus` icon).
  - **Cards** in a 2-column grid, gap 20. Each card has `--background`, a 1px `--border` and no radius.
    - **Body** (padding 20px 20px 16px, gap 12):
      - a row with a **StatusBadge** (Active `info`, Upcoming `neutral`, Completed `success`) and the dates at 13px muted ("6 Jul – 18 Dec 2026", or "Starts 11 Jan 2027");
      - the **name** at 20/28/600, -0.3px;
      - a **stats row** (gap 28): each stat is a 12px muted label over an 18px/600 value, for Interns, Mentors, On notice and Terminated;
      - a **colour bar** (8px, with a legend), or "No interns yet. Import them from Airtable to get started."
    - **Footer** (1px top border, padding 12px 20px): a mentor **AvatarStack** (sm, max 5) and a ghost `sm` **View batch** button with an arrow.
- **A2 Batch** (the header):
  - the name (28/36/600) with a StatusBadge;
  - under it, 14px muted: "6 Jul – 18 Dec 2026 · Programme manager: Rajesh Menon";
  - managers get outline buttons **Import from Airtable** and **Assign mentors**.
  - Then a 7-column summary strip (counts per colour, on notice, terminated), and **Tabs: Interns, Mentors, Notice tracker**.
- **A4 Mentors tab:** a table (`2fr 2fr 1fr 1fr 110px`, gap 16; header 10px 16px, 12/500 muted on `slate-50`; rows 12px 16px, 14px) with Mentor (28px avatar and name at 500), Email (muted), Feedback given, Last feedback (muted), and **Remove** (ghost-muted `sm`, managers only).
- **A9 Create batch** (Kuat Dialog, **520px**):
  - description "Add interns from Airtable once the batch is created.";
  - **Batch name**;
  - **Start date** and **End date** side by side (a 2-column grid, gap 12);
  - **Programme manager** (a Select);
  - footer: Cancel and **Create batch**.

## Decisions needed
Most of A1 and A2 is about **interns, which arrive in Phase 7** (interns), and **feedback (Phase 8)**. The design has no "before interns" version.

### (1) The batch card before interns exist
| Option | What it means |
|---|---|
| **A. Show what exists; add the rest with Phase 7** *(recommended)* | The badge, dates, name, a stats row with **Mentors** only, and the footer (mentor avatars, View batch). **No colour bar and no "No interns yet…" line:** that line points to the Airtable import, which doesn't exist yet. Phase 7 adds Interns, On notice, Terminated and the bar. |
| B. Show the whole card with zeros | Interns 0, On notice 0, Terminated 0 and the "Import them from Airtable" line, before any of it works. |

### (2) The batch page before interns exist
| Option | What it means |
|---|---|
| **A. The header, then "Mentors", then "Past members"** *(recommended)* | **The header as designed, without its buttons:** Import comes in Phase 7, Assign mentors in 6.6. **No summary strip and no tabs yet:** a single tab looks odd, and Phase 7 adds Interns as the first tab. **"Mentors" (an 18px/600 heading, as in A5)** with the A4 table: Mentor, Email, Assigned (date). Feedback given and Last feedback come in Phase 8, and Remove in 6.6. **"Past members":** the same table style with Member, Role, Assigned and Unassigned, for mentors who left and replaced PMs. This isn't in the design; it's what ROADMAP 6.5 asks for. It's hidden when there are none. |
| B. The tabs now, with Interns as an empty placeholder | Closer to the drawing, but the first thing everyone sees is an empty tab. |

### (3) Status
- **Worked out from the dates and today:** **Upcoming** (`neutral`) before the start, **Active** (`info`) up to and including the end date, **Completed** (`success`) after it.
- **An archived batch shows "Archived"** (`neutral`). The design has no archived state, and nothing in the design archives a batch. **Recommended: no archive button in 6.5** (the API from 6.3 is there). Archiving can get a place when there's a design for it.
- **The subtitle counts:** "N batches · X active, Y upcoming", or for mentors "N batches assigned to you".

### (4) Create batch
- **Admins only** (PRODUCT §6: "An admin creates a batch"; the 6.3 API). The design shows the button to PMs too; **that's recorded as a difference.**
- **The fields:**
  - **dates as native `<input type="date">`**, styled as the Kuat Input, so the browser supplies the calendar and the format;
  - **the PM as a native `<select>`** styled as the Kuat Select trigger (180px is the design's table size; the dialog's is full width), listing **active users with the Programme manager role** (from `GET /users`, which admins can call).
  - Kuat's Select and DatePicker use custom popovers, which 5.3 found the linter rejects, and native controls are more accessible.
- **The copy:** the design's description is kept, since Phase 7 is next. The **dates are defaulted:** start empty; once a start is picked and the end is still empty, **the end becomes start + 18 months** (DATA_MODEL: "about start + 18 months"), and it can still be changed.
- **After creating, go to the new batch's page.** The list is refetched.
- **Errors:** inline, from the contract; `batch_name_taken` under the name; anything else in a Callout (as in 5.2).

### (5) Empty states (not in the design)
- **Admin:** "No batches yet." with the Create batch button in the header.
- **Mentor or PM:** "You aren't assigned to any batches yet."
- **An unknown or hidden batch** at `/batches/<id>`: the existing "Page not found" (4.2).

### (6) Small API additions
- **`BatchSummary.mentors`** (current mentors' `{ id, name, avatarUrl }`) for the card's avatar stack. `mentorCount` stays.
- **`email` on a member's `user`**, for the Mentors table. Only people who can see the batch can read it.

## Plan
- **Contracts and API:** the two additions in (6), with their tests.
- **Web `api/batches.ts`:** `batchesQuery`, `batchQuery(id)` and `createBatch(body)`.
- **Web `batches/`:**
  - `batch-status.ts` (status from dates, with tests);
  - `format-dates.ts` ("6 Jul – 18 Dec 2026", "Starts 11 Jan 2027", and month and year when years differ; `en-GB`, tested);
  - `batch-card.tsx`;
  - `create-batch-dialog.tsx`;
  - `members-table.tsx`.
- **Web `ui/`:**
  - `avatar-stack.tsx` (Kuat AvatarStack: overlapping `sm` avatars and "+N");
  - `StatusBadge` gains `info` and `success`;
  - `Button` gains `ghost`;
  - `select.tsx` (the styled native select);
  - `TextInput` is reused for the dates.
- **Pages and routes:**
  - `pages/batches-page.tsx` replaces the placeholder;
  - `pages/batch-page.tsx` at `/batches/$batchId`, with the crumb being the batch name;
  - an invalid id is "Page not found".
- **design/README.md:** "Batches (A1, A2, A9) as built in 6.5", with the decisions, and the PM Create batch difference.

### Tests
- **Unit:** status from dates (the day before the start, the start, the end, the day after, archived); the date formats (same year, across years, upcoming).
- **Batches page:**
  - an admin sees cards in the API's order, with badge, dates, name, mentor count and avatars;
  - the subtitle counts;
  - a mentor sees "My batches" and "N batches assigned to you", and **no Create batch**;
  - each empty state;
  - View batch goes to the batch page.
- **Create batch:**
  - the PM list has only active PMs;
  - picking a start fills the end (+18 months);
  - invalid fields are shown and nothing is sent;
  - success sends the trimmed body and goes to the new batch;
  - `batch_name_taken` shows under the name;
  - a 500 shows the Callout.
- **Batch page:**
  - the header (name, badge, dates and PM);
  - current mentors with email and date;
  - "Past members" lists a replaced PM and an unassigned mentor, and is hidden when there are none;
  - an unknown batch is "Page not found".
- **Mutations** (on copies, restored with `cp`): the status off by a day at the end; Create batch shown to non-admins; past members mixed into the current list. Each must fail a test.

### Out of scope
- **Interns, the summary strip, tabs, the colour bar and the notice tracker** (Phase 7), and the feedback columns (Phase 8).
- **Assign mentors, and Remove** (6.6).
- **Archiving from the UI** (decision 3).
- **Mobile (MM1)** layouts, as with the earlier pages.

### Steps
1. The API and contract additions.
2. The UI pieces: AvatarStack, the badge types, the ghost Button, Select.
3. The list page and cards, with tests.
4. The Create batch dialog, with tests.
5. The batch page, with tests.
6. Docs. Run `pnpm check`, do the browser check (Compose, headless Chrome, a test admin and a test mentor, with test batches), and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- **In the browser:**
  - computed styles of the cards, badges, avatar stack, the batch header, the tables and the 520px dialog match the measurements above;
  - creating a batch lands on its page;
  - a mentor sees only their batch, titled "My batches".
- The test rows are deleted afterwards.
