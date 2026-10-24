# 7.8 Batch card counts — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/src/batch.ts` (+ test) | **`InternCounts`** `{ total, onNotice, terminated, colours: { green, yellow, borderline_yellow, orange, borderline_red, red, none } }`, all non-negative integers. **`BatchSummary.interns`**, which `BatchDetail` inherits. |
| `apps/api/src/modules/cohort/application/intern-counts.ts` | **The `InternCounts` port** (batch ids → counts; a batch without interns is absent), the view type, and `noInterns` (zeros). |
| `intern/infrastructure/drizzle-intern-counts.ts` (+ int test) | **The intern module implements it with one grouped query:** `count(*)` with a `filter` for on notice, terminated, each colour, and no colour (`is null`). With no batch ids, it asks nothing. |
| `cohort/infrastructure/drizzle-batch-queries.ts`, `drizzle-batch-admin.ts`, `http/batch-views.ts`; `main.ts`, `test/app-deps.ts` | `createBatchQueries(db, internCounts)` and `createBatchAdminTransaction(db, internCounts)` take the port's factory, so it's bound to the same database or transaction. **`listSummaries` asks once for all the listed batches**, and `detail` for its one batch. Missing batches get zeros. |
| `apps/web/src/interns/colour-bar.tsx` | **A1's bar:** 8px high, 2px gaps; a segment per code with interns, sized by `flex-grow` = its count (so the gaps don't widen the bar); the dot tokens from 7.4. Then **the legend**: every code with its count, wrapping with 14px × 4px gaps, 12px muted. The bar is `aria-hidden`; the legend is a list, "Colour codes". |
| `batches/batch-card.tsx` | **Stats:** Interns, Mentors, On notice, Terminated, or Mentors only with **"No interns yet."** (13px muted) in place of the bar. |
| `pages/batch-page.tsx` | The Interns tab count comes from `batch.interns.total`, shown with the page rather than after the roster loads. |
| `interns/add-intern-dialog.tsx` | Adding also refreshes the batch and the batch list, so the counts change at once. |
| `apps/web/src/test/fixtures.ts`; six page tests | A shared `noInternCounts` for the existing batch fixtures. |
| `README.md`, `design/README.md`, `ROADMAP.md`, `workflow/README.md` | The counts on `GET /batches`; **"Batch card counts (A1) as built in 7.8"**; the "Built before v2" note for A1; **7.8 added to the roadmap and the board.** |

## How to verify
```sh
pnpm check     # contracts 63 + web 175 + api 478
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 63 + 175 (+3) + 478 (+3). Format and lint clean, with no suppressions. |
| Counts query (2, Testcontainers) | Three batches. **Mixed:** 6 interns (two green, one graduated; red on notice; red terminated; borderline yellow; one without a code) → total 6, on notice 1, terminated 1, and the right colour counts with `none: 1`. **Another batch:** only its own intern. **Empty:** absent from the map. No ids → nothing asked. |
| Routes (1) | After two interns are added, **`GET /batches/:id` and `GET /batches` both report them**. A second, empty batch is listed with zeros, in its own place. |
| Web (3) | The four stats. **Bar segments** only for codes with interns, each with its count as `flex-grow`. The legend lists all 7 with counts. **"No interns yet."** with Mentors only and no legend. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:**<br>• every batch given the first batch's counts (route);<br>• terminated counted as on notice (counts query);<br>• `colour = null` instead of `is null`, so no-colour interns aren't counted (counts query and route);<br>• the bar shown for an empty batch (card). |
| **Browser** (Compose, headless Chrome at 1440, as an admin; three batches with 12, 3 and 0 interns added through the API, then colours and statuses set directly in the database) | **Mixed:** Interns 12, Mentors 0, On notice 2, Terminated 1. Seven segments: 127 / 42.3 / 42.3 / 84.7 / 42.3 / 84.7 / 84.7px, which is each count's share of the 508px left after six 2px gaps. **All green:** one 520px segment, and the legend with six zeros. **Empty:** Mentors only and "No interns yet." (13px muted). Bar 8px with a 2px gap, 8px above the legend; legend 14px × 4px gaps, 12px muted, 8px dots; stats 28px apart, labels 12px muted, values 18/600. The batch page's tab read "Interns 12". |
| Clean-up | Test users, sessions, batches, interns and events deleted. The trigger was bypassed only inside the cleanup transaction, and is still enabled. Only your account (and its own session) remains. Chrome stopped; tokens and screenshots removed. |

## Decisions & trade-offs
- **All three decisions as recommended:** every intern counts; a port implemented by the intern module; empty segments left out.
- **The batch list still loads in two queries plus one,** the one being the grouped count. That's one extra query, not one per batch.
- **Adding an intern refreshes the batch, the batch list and the roster.** Three small refetches, so every count stays right without working them out in the browser.

## Deviations from plan
- **The tab count now comes from the batch.** Before, it came from the roster query. Once the batch carries its counts there's no need to wait for the roster.

## Not done / follow-ups
- **A1's other v2 differences:** the separate Archived badge, and the loading and error states (design/README → "Built before v2").
- **Next on the roadmap:** 7.5, the intern profile page.
