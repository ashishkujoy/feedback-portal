# 7.4 Batch roster UI — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/intern/application/intern-queries.ts`, `infrastructure/drizzle-intern-queries.ts` | **`listForBatch`:** the batch's interns as summaries, sorted by `lower(name)` then id. |
| `intern/application/manage-interns.ts`, `intern-admin.ts`, `infrastructure/drizzle-intern-admin.ts` | **`listInterns`:** `BatchAccess` first (not visible → 404), then the list. Anyone who can see the batch can read it, mentors and archived batches included. The scope gains `queries`. |
| `intern/http/interns.routes.ts`, `intern-views.ts` | **`GET /batches/:batchId/interns`** → 200 `InternSummary[]`. |
| `apps/web/src/interns/roster.ts` (+ test) | **Pure roster logic:**<br>• `RosterFilter` (All, the six colours, No colour, On notice, Terminated, Withdrawn, Graduated), with labels;<br>• `inFilter` and `matchesUsername` (ignores case and a leading `@`);<br>• `rosterCounts`, and `byName` (ignores case and accents);<br>• `internBadge`: "On notice · N days left" (`error`), "Notice ended · decision needed" (`warning`), or the final statuses;<br>• `isReadOnly` (a final status, or an archived batch);<br>• `rosterRows`, which builds the visible rows. |
| `batches/batch-dates.ts` | `daysBetween` for days left. |
| `interns/colour-chip.tsx` | **REF-1's tokens** for each code and No colour, the summary dots for the statuses, and **`ColourChip`** (an 8px dot and the label, 12/18, padding 2px 8px). |
| `interns/intern-card.tsx`, `roster-table.tsx`, `roster-panel.tsx` | **A2's card**, **A3's table** with "Showing N of M interns", and the panel:<br>• the summary strip, the search, the Cards / Table toggle and the filter tags;<br>• no results with **Clear filters**;<br>• 8 skeleton cards while loading;<br>• an error Callout ("… Your filters are kept.") with **Retry**;<br>• the empty state, worded for managers or for others. |
| `ui/tag.tsx`, `status-badge.tsx`, `avatar.tsx`, `skeleton.tsx`, `view-toggle.tsx`; `styles.css` | **`ToggleTag`** (Kuat Tag in toggle mode: `aria-pressed`, the selected background and a check, a hover border). **StatusBadge** gains `warning` and `error`. Avatar gains **`lg`** (48px). New **Kuat Skeleton** (and its shimmer keyframes) and the **view toggle** (a `fieldset` of pressed buttons). The display Tag (top bar) is unchanged. |
| `pages/batch-page.tsx`, `app/routes.tsx` | **Tabs** (Interns with its count, Mentors with the mentor count) under the header. Mentors holds the 6.6 tables. The route validates **`tab`, `view`, `filter` and `q`** in the URL and drops bad values; defaults stay out of the URL. |
| `interns/add-intern-dialog.tsx` | **Adding an intern refreshes the roster** (it invalidates `internsQuery`). |
| `README.md`, `design/README.md` | The list endpoint. **"Batch page and roster as built in 7.4"**: the decisions, and where it differs from v2. |

## How to verify
```sh
pnpm check     # contracts 63 + web 172 + api 475
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 63 + 172 (+28) + 475 (+6). Format and lint clean, with no suppressions. |
| API list (6, Testcontainers) | Sorted by name ignoring case (`aarav Sharma`, `Ishita Rao`, `Zoya Ansari`). Only that batch's interns. **200 for the PM, a mentor on the batch and an admin.** Still readable once archived. **404** for a user not on the batch and for an unknown batch; 401 signed out. |
| Roster logic (14) | Counts for all 12 filters. v2's label order. Status filters select by status, not colour. Search: 5 matching cases and the name ignored. Sorting with accents and case. Badges: 15 days, 1 day, 0 days, ended, and the final statuses. Read-only for final statuses and archived batches. |
| Web (14 new; 6 earlier tests moved to `?tab=mentors`) | **Tabs:** Interns first with counts; Mentors shows the old tables and writes `?tab=mentors`. **Cards:** in name order, each with `@username`, the colour chip, the badge and Read-only. **The summary's 11 cells.** **The table:** rows, "Active", the footer and `?view=table`. **Filters:** one at a time, choosing one again returns to All, and the URL follows. **Search** with a filter, ignoring case. **The URL restores** the view, filter and search. **No results → Clear filters.** **Archived:** all cards read-only. **Empty** for a manager (opens Add intern) and for a mentor. **Loading:** 8 skeletons. **Error:** the filters are kept, and Retry loads. **A newly added intern appears.** |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **5, all caught:**<br>• the list's visibility check removed (route 404);<br>• status filters ignoring status (logic and page);<br>• a case-sensitive search (logic and page);<br>• an archived batch not making cards read-only (logic and page);<br>• the dialog not refreshing the roster (page). |
| **Browser** (Compose, headless Chrome at 1440, as the batch's PM and one of its mentors; 12 interns added through the API, then colours and statuses set directly in the database) | **Tabs** "Interns 12" (selected) and "Mentors 1". **The summary strip:** 11 equal columns, cells with padding 12 and a 1px right border (none on the last), labels 12/16 muted, counts 20/600 at −0.3px. The counts were Green 3, Yellow 1, Borderline Yellow 1, Orange 2, Borderline Red 1, Red 2, No colour 2, On notice 2, Terminated 1, Withdrawn 1, Graduated 1. **Search** 280×36. **Toggle** 7px 12px, 13/500; selected `ee-blue-50`/`700`. **Tags** 8px 10px, 14px; selected on the selected background with a check. **Cards:** 4 × 274px columns with a 16px gap; padding 16 and gap 12; a 48px avatar; the chip in the code's tokens; name 15/600; `@username` 13px mono, muted. Read-only cards on `slate-50` with a bordered footer. Ishita "On notice · 15 days left" (`error`); Meera "Notice ended · decision needed" (`warning`, notice ended 4 days earlier). **Red → `?filter=red`** (2 cards), then **"ISH" → `?filter=red&q=ISH`** (1); a reload kept both. **No results → Clear filters** cleared the URL (12 cards). **Table:** header on `slate-50`, 12px muted; rows with 10px padding; muted 13px "Active"; "Showing 12 of 12 interns". **Mentors tab** shows the Mentors table. **Empty batch:** the manager wording with Add intern, and the mentor sentence. **As the mentor:** the same 12 cards and no header buttons. |
| Clean-up | Test users, sessions, batches, interns and events deleted. The trigger was bypassed only inside the one cleanup transaction, and is still enabled afterwards. Only your account (and its own session) remains. Chrome stopped; tokens and screenshots removed. |

## Decisions & trade-offs
- **All five decisions as recommended.**
- **The empty state for managers says "Add interns one at a time."** v2's "Import interns from Airtable, or add them one at a time." would point at a button that doesn't exist yet. Phase 8 restores v2's sentence and button.
- **No results for a filter alone** names the filter ("No interns match "Red""); v2 only draws the search case.
- **Filter tags are Kuat's full-size Tag,** so the 12 tags wrap to a second line at 1440px. Kuat's own sizes were kept rather than shrinking them.
- **The view toggle and the filter tags are `fieldset`s** with a hidden legend, as the linter prefers to `role="group"`. Tests find them by the same accessible names.
- **The browser data set statuses directly in the database** (status changes come with 7.6 and Phase 9), keeping `notice_ends_on` consistent with the check constraint.

## Deviations from plan
- **No separate repository test for the list.** The route tests cover the SQL (order, one batch only) against the real database.
- **No contract change or contract test:** `InternSummary` (7.3) was enough.
- **`rosterRows` moved into the pure module.** Building rows inline in the component tripped the linter's new-array-as-prop rule, and the function is easier to test.

## Not done / follow-ups
- **A1 batch cards:** intern counts, on notice, terminated, and the colour bar (suggested as a small task after 7.4).
- **7.5:** cards and rows link to the profile. **7.7:** photos. **Phase 8:** Import and the Imports tab. **Phase 9:** feedback on the card and table, and the Overview and Notice tracker tabs.
- **v2 reconciliation** (design/README → "Built before v2").
