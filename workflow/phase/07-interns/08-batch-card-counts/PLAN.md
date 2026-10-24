# 7.8 Batch card counts — Plan

**Phase:** 7 — Interns
**Status:** Done

## Goal
Interns, on notice and terminated, and the colour bar, on the batch list (A1)

## Done when
- **`GET /batches` and `GET /batches/:id` include each batch's intern counts:** the total, on notice, terminated, and one count per colour code plus No colour.
- **The batch card (A1) shows them as v2 draws them:**
  - **Interns · Mentors · On notice · Terminated** in the stats row;
  - **the colour bar**, with its legend;
  - **"No interns yet."** for a batch without interns, which shows only Mentors in the stats row.
- API, repository and web tests pass, and `pnpm check` passes. In the browser, the cards match A1.

## What v2 draws (A1)
- **Stats row** (gap 28): each stat is a 12px muted label over an 18px/600 number. With interns: **Interns, Mentors, On notice, Terminated**; without: **Mentors** only.
- **Colour bar:** one 8px-high row of segments with 2px gaps. Each segment's width is its share of the batch's interns, in REF-1's order (Green, Yellow, Borderline Yellow, Orange, Borderline Red, Red, No colour), using the dot tokens.
- **Legend under it** (gap 8 from the bar; wrapping, with a 14px column gap and a 4px row gap, 12px muted): an 8px dot then "Green 12" for each colour, including zeros.
- **Empty:** "No interns yet." (13px muted) in place of the bar.
- **The counts cover every intern in the batch, whatever their status.** v2's sample colours add up to its intern total (12 + 18 + 8 + 7 + 5 + 6 + 12 = 68).

## Decisions needed

### (1) Which interns count
**Recommended: everyone in the batch, whatever their status.** That's what v2's sample adds up to, and it matches the roster's "All" and the Interns tab count (7.4). On notice and Terminated are counted separately, as in the roster's summary.

### (2) Where the counts come from
The cohort module serves the batch list, but the counts live in the intern module's table.

| Option | What it means |
|---|---|
| **A. A port** *(recommended)* | Cohort defines `InternCounts` (batch ids → counts), and **the intern module implements it** with one grouped query. This is the same pattern as identity's `RoleAssignments`, so cohort never reads intern tables. |
| B. The web fetches each batch's roster | One request per card. Simple, but it gets slower as batches grow, and it loads every intern just to count them. |

### (3) Empty segments
v2 draws a zero-width segment for a colour no one has, which leaves an extra 2px gap.

**Recommended: leave out empty segments,** so the gaps are only between real ones. The legend still lists every colour, with its 0.

## Plan

### Contracts
- **`BatchSummary` gains `interns`:** `{ total, onNotice, terminated, colours: { green, yellow, borderline_yellow, orange, borderline_red, red, none } }`, all non-negative integers. `BatchDetail` inherits it.

### API
- **`cohort/application/intern-counts.ts`:** the port `(batchIds) => Promise<Map<BatchId, InternCounts>>`; a batch with no interns gets zeros.
- **`intern/infrastructure/drizzle-intern-counts.ts`:** one grouped query on `interns` for the given batches: `count(*)`, a `filter` for each status, and a group by colour.
- **`drizzle-batch-queries.ts`:** `listSummaries` and `detail` take the port (bound to the same database or transaction) and add the counts. **`main.ts`, `drizzle-batch-admin.ts` and `test/app-deps.ts` wire it in.**
- **`batch-views.ts`:** maps the counts to the contract.

### Web
- **`batches/batch-card.tsx`:** the stats row, and **`interns/colour-bar.tsx`** (the bar and its legend, using 7.4's `colourTones`, with the bar `aria-hidden` and the legend as a list), or "No interns yet."
- **`batch-page.tsx`'s Interns tab count** comes from the batch's `interns.total`, so it's shown before the roster loads.

### Tests
- **Counts query** (Testcontainers):
  - several batches with mixed colours and statuses;
  - a batch with none gets zeros;
  - another batch's interns aren't counted.
- **Routes:** `GET /batches` and `GET /batches/:id` include the counts, and they change after an intern is added.
- **Web (card):**
  - the four stats;
  - a bar segment per colour that has interns, sized by share;
  - the legend with all 7 colours and their counts;
  - "No interns yet." with Mentors only.
- **Mutations** (on copies, restored with `cp`):
  - counts not filtered by batch;
  - terminated counted as on notice;
  - interns without a code not counted as No colour;
  - the card showing the bar when empty.

  Each must fail a test.

### Out of scope
- **Other A1 differences from v2,** such as the separate "Archived" badge and the loading and error states. They're listed under design/README's "Built before v2".
- **Graduated and Withdrawn counts on the card.** v2 shows them only in the roster's summary.

### Steps
1. Contract, port, counts query and wiring, with tests.
2. The card and colour bar, with tests.
3. Run `pnpm check`, run the mutations, do the browser check (Compose, headless Chrome, as an admin with three batches: mixed, all one colour, and empty), and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- In the browser, the cards match A1.
- The test rows are deleted afterwards.
