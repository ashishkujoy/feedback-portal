# 6.5 Batches UI — Review

## What changed
| File | Notes |
|---|---|
| `apps/web/src/pages/batches-page.tsx` | **A1 / P1 / M1.** The title ("Batches", or "My batches" for mentors) and the subtitle ("N batches · X active, Y upcoming", or "N batches assigned to you"). **Create batch for admins only** (decision 4). Cards in the 2-column grid (gap 20), **ordered active, upcoming, completed, then archived** (see Deviations). The empty states (decision 5), and an error Callout. |
| `apps/web/src/batches/batch-card.tsx` | **The card before interns** (decision 1A): StatusBadge and dates, the name (20/28/600), a stats row with **Mentors**, and the footer with the mentor AvatarStack and a ghost `sm` **View batch** link (named "View \<batch\>"). |
| `apps/web/src/pages/batch-page.tsx`, `batches/members-table.tsx` | **A2 before interns** (decision 2A): the header (name with badge; "dates · Programme manager: Name"), then **"Mentors"** (A4's table: Mentor with avatar and an Inactive badge where relevant, Email, Assigned) and **"Past members"** (Member, Role, Assigned, Unassigned; hidden when empty). |
| `apps/web/src/batches/create-batch-dialog.tsx` | **A9**, 520px: Batch name; Start and End date (native date inputs, 2 columns, gap 12); Programme manager (a native select listing **active users with the PM role**, by name). Validated with the shared `CreateBatchRequest`. **Picking a start fills an empty end with start + 18 months.** On success it caches the batch, refetches the list, closes, and **opens the new batch**. `batch_name_taken` shows under the name; anything else in a Callout. |
| `apps/web/src/app/routes.tsx`, `ui/breadcrumb.tsx` | `/batches` is now a parent with `/` (the list) and **`$batchId`**. The batch route's **loader** fetches the batch first, so **its name is in the breadcrumb** at once. A crumb can now be worked out from the route's loader data. An id that isn't a uuid, or a 404 from the API (missing, or not visible, 6.4), is **"Page not found"** (`notFound()`). |
| `apps/web/src/batches/batch-status.ts`, `batch-dates.ts` (+ tests) | **Status** from the dates (decision 3), the badge for each status, the date text, and the list order. **Dates in the design's style** ("6 Jul – 18 Dec 2026", across years with both years, "Starts 11 Jan 2027"); months are spelled out rather than taken from Intl, whose en-GB "Sept" varies. `addMonths` clamps (31 Aug + 18 months → 29 Feb). |
| `apps/web/src/ui/` | **`StatusBadge`** gains `info` (`ee-blue-500`, info icon) and `success` (`uptime-green-500`, check icon), each with a 12px icon at gap 6. **`AvatarStack`** (Kuat sm: 28px, 30% overlap, a 2px `--background` ring, "+N" after 5; the names are screen-reader text). **`Button`** gains `ghost`, and **`buttonClasses`** for links; hover and active now use `not-disabled:`, so they work on links too. **`Select`**: a native select styled as the Kuat trigger. |
| `apps/web/src/api/batches.ts` | `batchesQuery`, `batchQuery(id)`, `createBatch` |
| `packages/contracts`, `apps/api` (cohort queries and views) | **`BatchSummary.mentors`** (current mentors, in assignment order) and **`email` on a member's user** (decision 6). |
| `.oxlintrc.json` | TanStack's `NotFoundError` added to the throwable types, next to `Redirect`, which was already there |
| `design/README.md` | "Batches (A1, A2, A9) as built in 6.5" |

## How to verify
```sh
pnpm check     # contracts 58 + web 121 + api 389
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 58 + **121** (+30) + 389. `pnpm format:check` is clean. |
| Unit (12) | Status: the day before the start, the start, the end date, the day after, and archived. Dates: same year, across years, "Sep", the local day of a moment, today, `addMonths` with clamping. The list order. |
| Batches page (8) | Cards **in the design's order from the API's order**, with each badge, the dates, the name, the mentor count, the avatar names and "+1"; the admin's subtitle and Create batch; **a mentor sees "My batches", "1 batch assigned to you" and no Create batch**; **no Create batch for a PM**; both empty states; the error Callout; View batch opens the batch. |
| Create batch (7) | Only active PMs, by name (case ignored); focus on the name; **the end filled 18 months on**, **but an end already chosen is kept**; nothing sent when invalid (three field errors); **success sends the trimmed body and lands on the new batch's page**; `batch_name_taken` under the name (focused); a 500 in a Callout. |
| Batch page (6) | The header and **the breadcrumb "My batches › Batch 2027"**; current mentors (Inactive shown); **past members: a replaced PM and a mentor who left**; past members hidden when there are none, and "No mentors yet."; **"Page not found" for a 404, and for a non-uuid id without calling the API**. |
| API | The list has current mentors in assignment order; the detail has members' emails |
| **Mutations** (on copies, restored with `cp`) | **8, all caught:** the status a day short at the end; Create batch for everyone; past mentors in the current table; inactive PMs offered; the API's 404 not mapped; the list order dropped (page); and, **after adding a test, an end date that was already chosen being overwritten** (it survived at first). |
| **Browser** (Compose rebuilt; headless Chrome at 1440 × 900; a test admin and a test mentor with sessions, 2 test PMs and 6 test mentors; 3 test batches made through the API with assignments, an unassignment and a PM replaced and restored, plus 1 made through the dialog; **all deleted afterwards**, and your account is unchanged) | **List:** grid 562 + 562, gap 20; card 1px `--border`, white, square; body 20 20 16, gap 12; **badges:** Active `ee-blue-500`/white, Upcoming `server-slate-200`/`neutral-950`, Completed `uptime-green-500`/white, all 3px 8px, 12/600, gap 6, 12px icon; dates 13px muted ("Starts 11 Jan 2027", "6 Jul – 18 Dec 2026", "13 Jan 2025 – 26 Jun 2026"); name 20/28/600/-0.3px; stat 12px muted over 18/600; footer 12px 20px with a 1px top border; **avatars** 28px, 8px overlap, 2px white ring; View batch 32px, 0 12px, gap 6, 14/500 `ee-blue-500`, transparent. **Batch page:** crumbs "Batches › Check Batch Active"; heading gap 12, then 6; sub 14px muted; h2 18/600/-0.2px; sections gap 12; th 10px/16px, 12/500 muted on `slate-50`; td 12px/16px, 14px; 5 current mentors; **past members: the replaced and restored PM, the mentor who left, the temporary PM**. **Dialog:** 520 wide, the design's copy, focus on the name, dates 231 + 231 with gap 12, 36px inputs and select, **an empty end filled with 5 Jan 2029 from 5 Jul 2027**, only the two test PMs offered; **creating landed on the new batch** ("Starts 5 Jul 2027 · Programme manager: Ravi Manager"). **Mentor:** "My batches | 2 batches assigned to you", only their 2 batches, no Create batch; another batch → "Page not found". I looked at screenshots of the list, the batch page and the dialog. |

## Decisions & trade-offs
- **All six decisions taken as recommended.**
- **The loader fetches the batch before the page renders,** so the breadcrumb and heading never flash, and a missing batch can render "Page not found" in the shell. If the API fails for another reason, the page shows its own error instead.
- **Native date inputs and select.** They're keyboard- and screen-reader-friendly, and the linter accepts them (5.3 found it rejects custom listboxes). The closed controls match Kuat; the open calendar and list are the browser's.
- **The avatar stack clips initials where the avatars overlap,** exactly as Kuat's AvatarStack does (the same 30% overlap). With photos, which Google sign-in provides, it reads better.

## Deviations from plan
- **The list is ordered by status in the page.** The browser check showed the API's order (newest start first) put Upcoming before Active, but the design lists Active, Upcoming, then Completed. The page now orders by status and keeps the API's order within each status. The page test feeds batches in the API's order, so it fails if the sorting is removed.
- **`Button` hover and active now use `not-disabled:`, not `enabled:`.** `:enabled` never matches a link, so View batch (a link styled as a button) had no hover.

## Not done / follow-ups
- **6.6:** Assign mentors (A11) and Remove on the Mentors table; possibly changing the PM.
- **Phase 7:** the Interns tab and summary strip, the card's intern stats and colour bar, and Import from Airtable.
- **Archiving from the UI**, once there's a design for it.
