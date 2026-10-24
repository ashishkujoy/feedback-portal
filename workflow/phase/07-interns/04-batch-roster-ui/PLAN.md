# 7.4 Batch roster UI — Plan

**Phase:** 7 — Interns
**Status:** Done

## Goal
Interns shown as cards or a table with color code, status, and filters

## Done when
- **`GET /batches/:batchId/interns`** lists a batch's interns for anyone who can see the batch (6.4). A batch they can't see is a 404.
- **The batch page gets v2's tabs.** **Interns** (the roster) comes first; **Mentors** holds 6.6's Mentors and Past members tables.
- **The roster follows v2:**
  - A2 cards and the A3 table, with a Cards/Table toggle;
  - the summary strip, search by username and the filter tags;
  - the M2 mentor view;
  - the states: empty (`A2-empty`), no results (`A2-noresults`), loading (`A2-loading`) and error (`A2-error`), plus read-only interns.
- **Adding an intern (7.3) refreshes the roster.**
- API, repository and web tests pass, and `pnpm check` passes. In the browser, the roster matches A2/A3 as a PM and M2 as a mentor.

## What v2 draws (A2, A3, M2 and states)
- **Tabs** (Kuat Tabs, under the header): Overview *(not for mentors)*, **Interns (count)**, **Mentors (count)**, Notice tracker (count), Imports *(not for mentors)*.
- **Summary strip:** one bordered row of 11 cells (padding 12px, a 1px right border). Each cell has an 8px dot with a 12/16 muted label, then the count at 20px/600.
  - Cells: the six colour codes and **No colour** (REF-1's tokens), then **On notice**, **Terminated**, **Withdrawn** and **Graduated**.
- **Toolbar:** "Search by username" (280px Input with a search icon) on the left and a **Cards | Table** segmented toggle on the right. The selected side uses `ee-blue-50` / `ee-blue-700`, 13px/500.
  - Below the toolbar, the filter Tags (toggle mode, gap 6): **All N**, then one per summary cell with its count.
- **Card (A2):**
  - 4 columns with a 16px gap; each card has padding 16px and a 12px gap;
  - a 48px avatar, with the colour chip at the top right (a pill with a dot);
  - the name (15/600), then `@username` (13px mono, muted);
  - a status badge row (22px):
    - "On notice · N days left" (`error`), or "Notice ended · decision needed" (`warning`) once it has ended;
    - Graduated (`success`), Terminated / Withdrawn (`neutral`);
    - nothing for Active;
  - a footer with a top border: "N feedback · \<last date\>" and **Give feedback** (ghost `sm`), or "🔒 Read-only" for final statuses and archived batches. **Read-only cards sit on `slate-50`.**
- **Table (A3):**
  - columns Intern (avatar, name over `@username`), Colour code, Status (a badge, or a muted "Active"), Feedback, Last feedback, and an action (130px);
  - a footer: "Showing N of M interns".
- **States:**
  - **No results:** "No interns match "\<q\>"", then "Try another username, or clear the search and filters.", with **Clear filters**.
  - **Loading:** 8 skeleton cards.
  - **Error:** an `issue` Callout "We couldn't load the interns", then **Retry**.
  - **Empty:** "No interns yet", then for managers "Import interns from Airtable, or add them one at a time." with **Import from Airtable** and **Add intern**; for others "The programme manager adds interns to this batch."
- **M2 (mentor):** the same roster without the manager actions.

## Decisions needed

### (1) Which tabs now
**Recommended: only Interns and Mentors.** Overview (P24), Notice tracker (A5) and Imports (A25) come with the tasks that fill them (Phase 8 and 9). An empty tab would promise features that don't exist yet.

### (2) Feedback parts of the card and table
"N feedback · last date", **Give feedback**, and the Feedback and Last feedback columns all depend on Phase 9.

**Recommended: leave them out until Phase 9.**
- The card's footer shows only **Read-only** when it applies; otherwise there's no footer.
- The table drops the two feedback columns, and its action column shows only Read-only.

### (3) Filters
**Recommended:**
- **One filter at a time** (All, a colour, or a status), as v2's counts suggest: each tag's count is that group's size.
- **The filter, search, view and tab are kept in the URL** (`?tab=mentors`, `?view=table&filter=red&q=ish`), as on Users and roles (5.1), so a refresh or a shared link keeps them.
- Search matches the username, ignoring case.

### (4) Order and size
- **Recommended: sorted by name** (as v2's sample is), ignoring case and accents, the same as Users and roles.
- **All interns load at once, with no paging.** A batch has fewer than about 100, and v2's footer ("Showing N of M") counts after filtering rather than paging.

### (5) What isn't built yet
- **Avatars use initials** until photos (7.7).
- **Cards and rows aren't links** until the profile exists (7.5).
- **The empty state's Import from Airtable button** comes with Phase 8; until then it shows only **Add intern**.
- **"Days left" for a notice** is computed from `noticeEndsOn` and today. Interns can't be put on notice until Phase 9, so for now this shows only in tests.

## Plan

### Contracts
- **`InternSummary`** (7.3) is enough for the roster; no change. Add a test for a list of them.

### API (intern module)
- **`application/intern-queries.ts` + `infrastructure/drizzle-intern-queries.ts`:** `listForBatch(batchId)` returns `InternSummary` rows, sorted by name in SQL (`lower(name)`, then id). Accent-insensitive sorting is done in the web, as for users.
- **`listInterns` use case:** checks `BatchAccess` (not visible → 404); any viewer who can see the batch can read it, including mentors and archived batches.
- **`GET /batches/:batchId/interns`** → 200 `InternSummary[]`.

### Web
- **`api/interns.ts`:** an `internsQuery(batchId)`. **The Add intern dialog invalidates it** when an intern is added.
- **`interns/roster.ts` (pure, tested):**
  - the summary counts (7 colour cells including No colour, and 4 status cells);
  - filtering (All / colour / status) and username search;
  - sorting by name;
  - the badge for each intern (label and type, including days left and "Notice ended");
  - whether it's read-only (a final status, or an archived batch).
- **`ui/` pieces:**
  - a **colour chip** (the pill with a dot, from REF-1's tokens);
  - the **summary strip**;
  - the **segmented toggle**;
  - **Tag** in toggle mode (check whether 5.1's Tag already does it);
  - a **Skeleton**;
  - a `lock` icon for Read-only.
- **`interns/intern-card.tsx`, `interns/roster-table.tsx`, `interns/roster.tsx`:** the toolbar, filters, the grid or table, and the states.
- **The batch page:**
  - Kuat Tabs (the existing `ui/tabs.tsx`) under the header;
  - **Interns** shows the roster, and **Mentors** holds the existing Mentors and Past members sections (A4);
  - the tab, view, filter and search come from the URL (validated route search params).

### Tests
- **Repository** (Testcontainers): lists only that batch's interns, sorted by name ignoring case.
- **Routes:**
  - 200 for the batch's PM, an admin and a mentor on the batch;
  - **404 for a user not on the batch and for an unknown batch**; 401 signed out;
  - an archived batch is still readable.
- **Pure roster functions:**
  - the counts for every colour and status;
  - each filter, search ignoring case, and search combined with a filter;
  - sorting with accents and case;
  - each badge, including 15 days left, ended, and final statuses;
  - read-only for final statuses and archived batches.
- **Web:**
  - the tabs, with Interns first and Mentors showing the old tables;
  - the summary counts;
  - cards and table showing the name, `@username`, colour chip and badge;
  - the toggle, filter and search updating the URL and the list, and surviving a reload;
  - no results, then **Clear filters**;
  - empty for a manager (Add intern) and for a mentor (the other sentence);
  - loading, then error with **Retry** refetching;
  - read-only cards;
  - adding an intern makes them appear.
- **Mutations** (on copies, restored with `cp`):
  - the visibility check removed from the list;
  - the filter ignoring status;
  - search becoming case-sensitive;
  - an archived batch not making cards read-only;
  - the dialog not invalidating the roster.

  Each must fail a test.

### Out of scope
- **The intern profile (7.5),** status changes (7.6) and photos (7.7).
- **Feedback** (Phase 9): counts, Give feedback, and colour codes being set.
- **Import (Phase 8)**, and the Overview, Notice tracker and Imports tabs.
- **A1's batch card counts** (interns, on notice, terminated, the colour bar). They need per-batch counts from the API. Suggested as a small follow-up task after 7.4, or tell me to fold it in.
- **The archived-batch Callout and Archive batch (A17), and Change PM (A16).**
- **The mobile roster (MM2).**

### Steps
1. API: queries, the use case and the route, with tests.
2. The pure roster functions, with tests.
3. The UI pieces, the card, table and roster, and the tabs on the batch page, with tests.
4. Run `pnpm check`, run the mutations, do the browser check (Compose, headless Chrome: as the PM with interns in several colours and statuses set directly in the test database, cards and table measured against A2/A3, filters, search, empty and no-results; as a mentor), and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- In the browser, the roster matches A2/A3 (and M2 for a mentor); the URL keeps the view, filter and search.
- The test rows are deleted afterwards.
