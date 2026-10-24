# 6.6 Assign/unassign UI — Review

## What changed
| File | Notes |
|---|---|
| `apps/web/src/batches/assign-mentors-dialog.tsx` | **A11**, 560px, with the design's copy. A **search** ("Search mentors", full width) filters by name or email and keeps the ticks. **A bordered list:** checkbox, 28px avatar, name (14/500, plus the Inactive badge where relevant) over email (12px muted), and the **load** (12px muted). **The batch's mentors first, ticked, then the others,** each by name, with the order fixed while open. The footer has **"N selected"** and Cancel / **Save mentors** (disabled until something changes; "Saving…"). **Saving sends the whole ticked set** (decision 1A) and shows the answer at once. A refusal shows a Callout and keeps the ticks. The candidates are fetched fresh each time it opens. |
| `apps/web/src/pages/batch-page.tsx`, `batches/members-table.tsx` | **For managers:** the outline **Assign mentors** button (`users` icon) on the right of the header, and **Remove** (ghost-muted `sm`, named "Remove \<name\>") in A4's 110px action column. **Remove unassigns at once** (decision 3A), and the mentor moves to Past members. A failure shows a Callout above the table. Nobody else sees either control, and archived batches have none. |
| `apps/web/src/batches/can-manage.ts`, `mentor-load.ts` (+ test) | `canManageMentors`: an admin or the batch's current PM, and not archived. The load: "2 active batches", "1 active, 1 upcoming", "1 upcoming batch" or "Unassigned" (completed batches don't count). |
| `apps/web/src/api/batches.ts` | `mentorCandidatesQuery`, `setMentors`, `unassignMentor`, and `showUpdatedBatch` (writes the API's answer to the batch cache and refetches the list) |
| `apps/web/src/ui/checkbox.tsx`, `search-input.tsx` | `CheckboxMark`, the Kuat box on its own, used by `Checkbox` and the dialog's rows; `SearchInput` takes a width |
| `packages/contracts/src/batch.ts` (+ test) | `SetMentorsRequest` (each mentor once) and `MentorCandidate` |
| `apps/api/.../domain/batch.ts` (+ tests) | **`setMentors`:** unassigns the mentors who aren't in the set and assigns the missing ones, **through `unassignMember` and `assignMember`**, so the rules stay in one place. **Keeping a current mentor isn't re-checked,** so an inactive mentor can be kept or removed later without blocking the save. |
| `apps/api/.../application/manage-batches.ts`, `http/batches.routes.ts`, `batch-views.ts` | **`PUT /batches/:id/mentors`** (one transaction) and **`GET /batches/:id/mentor-candidates`**. Both use the mentor routes' access: visibility first (404), then admin or the batch's current PM (403). |
| `apps/api/.../infrastructure/drizzle-batch-queries.ts` | **The candidates** (decision 2): active users with the Mentor role, plus the batch's current mentors even if inactive. Each has name, email, avatar, active and assigned flags, and **the dates of their other current, unarchived batches** (never names). |
| `design/README.md`, `README.md` | "Assign mentors (A11) and Remove (A4) as built in 6.6"; the two endpoints |

## How to verify
```sh
pnpm check     # contracts 59 + web 133 + api 400
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 59 (+1) + **133** (+12) + **400** (+11). `pnpm format:check` is clean. **No lint suppressions anywhere.** |
| Domain (5) | `setMentors` assigns the missing, unassigns the rest (with who and when) and **keeps the others' original rows**; returns the same batch when nothing changes; **keeps a current mentor who has become inactive**; applies the assignment rules to new mentors and leaves the PM alone; rejects an archived batch. |
| API (6) | **`PUT`:** sets exactly the given set, and repeating it changes nothing; **one ineligible person → 409 and nothing changes**; the batch's PM can, another PM gets 404, a mentor 403; duplicates → 400; archived → 409. **Candidates:** active Mentors and an inactive current mentor (not an inactive non-mentor); the other batches' dates **excluding archived batches and ended assignments**; the same access rules. |
| Web (12) | **Who sees the controls:** the batch's PM and an admin yes; a mentor on the batch and an archived batch no. **The dialog:** current mentors first and ticked, then by name (case ignored); the load as each checkbox's description; search by email keeps ticks; Save enabled only once something changes; **saving sends `[Cy, bo]` and both tables update from the answer**; a 409 shows the Callout and keeps the ticks; Cancel sends nothing. **Remove** sends the unassign, and the mentor moves to Past members. Plus the load text unit test. |
| **Mutations** (on copies, restored with `cp`) | **5, all caught:** saving only the newly ticked mentors (without the existing ones); the controls shown to everyone; completed batches counted in the load; `setMentors` not unassigning; inactive non-mentors listed as candidates. |
| **Browser** (Compose rebuilt; headless Chrome at 1440 × 900; a test admin, PM and mentor with sessions, 3 more test mentors, 3 test batches; **all deleted afterwards**, and your account is unchanged) | **As a mentor on the batch:** no Assign mentors and no Remove. **As its PM:** Assign mentors is 36px, 0 16px, gap 8, outline `ee-blue-500`, bottom- and right-aligned in the header; Remove is 32px, 0 12px, 14/500 `slate-700`; the action column is 134px (110 + padding), Remove 16px from the table's edge. **Dialog:** 560 wide with the design's copy; search 36px; the list's 1px `--border`; rows 10px 12px, gap 12, with 1px dividers; name 14/500, email and load 12px muted, the box 18px `--primary` when ticked; footer 16px above, a 1px border, space-between, "2 selected" 13px muted; **Save disabled at first**. **Rows:** Anjali ✓, Tomas ✓ (both "Unassigned" elsewhere), then Kofi ("Unassigned") and Nina ("**1 active, 1 upcoming**"). Searching "kofi" left only Kofi. **Ticking Kofi and unticking Tomas, then saving,** gave Mentors: Anjali, Kofi; Past members: Tomas. **Remove Anjali** gave Mentors: Kofi; Past members: Anjali, Tomas. **As the admin, the batch list's mentor counts** reflected it. I looked at screenshots of the dialog and the page afterwards. |

## Decisions & trade-offs
- **All five decisions taken as recommended:** one all-or-nothing save, a candidates endpoint that shares dates and not names, Remove without a confirmation, no programme-manager change in the UI, and the smaller points.
- **The candidates are read inside the batch transaction,** under the same access check as changing mentors, so a PM can't list them for a batch they don't run.
- **"Remove" and the dialog share one source of truth** (the batch's detail in the cache), so both tables always agree.

## Deviations from plan
- **I broke the API route test file mid-task and restored it.** A script of mine cut out an empty slice (the formatter had already reflowed the text it was looking for) and so inserted text between every character. The file was tracked, so I restored it from the last commit with `git show HEAD:<file>`, then re-added this task's tests with every insertion point checked first. `git diff` confirms the file only gained the new tests.
- **A lint suppression I added in that first attempt is gone.** The loop it covered is now four plain calls, and there are no suppressions anywhere.
- **Inactive candidates show the existing "Inactive" badge**, not ad-hoc "(inactive)" text, for consistency with 5.1 and 6.5.

## Not done / follow-ups
- **Changing the programme manager in the UI**, once there's a design for it. The API is there (`PUT /batches/:id/program-manager`).
- **Phase 7:** Import from Airtable, the Interns tab, and the card's intern stats.
- **Phase 6 is complete** with this task.
