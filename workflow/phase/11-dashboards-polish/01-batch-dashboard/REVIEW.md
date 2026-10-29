# 11.1 Batch dashboard — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/src/batch-overview.ts` | **`BatchOverview`**: `current` and `onNoticeCount`; `colours` of current interns; `onNotice` (intern, start, end, issued by); `toDeliver` (feedback id, intern, author, submission time, colour). |
| `intern/application/batch-overview.ts`, `intern-queries.ts`, `manage-interns.ts` | The view type, `InternQueries.overview`, and the use case **`batchOverview`** (anyone who can see the batch; otherwise 404). |
| `intern/infrastructure/drizzle-batch-overview.ts`, `drizzle-intern-queries.ts` | Three reads: colours over interns **not terminated or withdrawn** (grouped); on-notice interns with the **latest change to On notice** (`DISTINCT ON`) and its actor, soonest ending first; **submitted** feedback of interns **still active or on notice**, newest first, with intern and author. |
| `intern/http/overview.routes.ts`, `app.ts` | `GET /batches/:batchId/overview`, photo ids turned into URLs as the roster does. |
| `apps/web/src/api/batch-overview.ts` | The query (exact key). |
| `batches/overview/overview.ts` | `distributionRows`, `distributionNote`, `noticeLeft` (the profile banner's count; urgent at 7), `waitingLabel` (UTC days). |
| `batches/overview/overview-panel.tsx` | The three cards, Skeletons, the load error, and **Record conversation** opening A8 here (it loads the intern and their feedback). |
| `interns/profile/record-conversation-dialog.tsx` | An optional `onSaved`, so the overview refreshes too. |
| `pages/batch-page.tsx`, `app/routes.tsx` | The **Overview** tab, first, for admins and the batch's PM (archived too); Interns stays the default; a mentor's `?tab=overview` opens the roster. |
| `design/README.md` | "Overview (A24 / P24) as built in 11.1"; the batch page's tab note. |
| `pages/roster.test.tsx` | A manager's tab list now starts with Overview (not selected). |

## How to verify
```sh
pnpm check     # contracts 84 + web 404 + api 710
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** Web 404 (+15), API 710 (+2). Format and lint clean, with no suppressions; no new dependencies. |
| API (2) | A batch with interns in every state: **colours** count 5 current interns (graduated in, terminated and withdrawn out), 2 on notice; **on notice** Zoya (ends 16 Nov, issued by Meg) then Ishita (20 Nov, Mo); **to deliver** Kabir's awaiting entry and the two notices' feedback, newest first. Delivered feedback, drafts, read-only interns' feedback and another batch's are left out. **Access:** admin and mentor 200, a mentor of another batch 404, signed out 401; the other batch's PM sees only theirs. |
| Units (5) | Rows green → red → none with counts, shares, relative bars and rounded percentages; the note (singular too); no interns; "15 days left", urgent at 7, "1 day", "0 days" and ended; "waiting today / 1 day / 5 days" in UTC days. |
| UI (10) | **Tab** first for the PM with Interns selected; an admin sees it without Record conversation; a mentor has no tab and `?tab=overview` shows the roster. **Distribution** note and rows. **On notice:** the link to the profile, "Ends … · issued by …", Decision needed (warning), "6 days left" in red, "15 days left" not. **To deliver:** "2 submitted", "From … · 24 Oct 2026 · waiting today", the chips. **Record conversation:** A8 opens with that feedback checked, saves `{ feedbackId }`, closes and refreshes the overview. **Archived:** no Record conversation. **Empty states** and **the load error**. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:** terminated interns counted; delivered feedback listed; urgent below 7 instead of at 7; the tab shown to mentors. |
| **Browser** (Compose, headless Chrome, test users only, then deleted) | Seven interns (three on notice: one ended, one with 5 days left, one with 31; Tara terminated). **As the PM:** tabs "Overview, Interns 7*, Mentors 2"; "6 current interns, including 3 on notice." (Tara left out); bar segments 16.7 / 16.7 / 50 / 16.7%; rows as v2; On notice "Decision needed", "5 days left" in red-700, "31 days left"; the two cards side by side at 555px; "5 submitted", "waiting today / 2 days / 5 days", Tara's feedback left out. **Record conversation** from Diya's row: A8 "Diya Reddy · 1 submitted feedback awaiting delivery." with it checked; saved, the dialog closed, the row went, "4 submitted". **As a mentor:** no Overview; `?tab=overview` opened Interns. Matches v2 A24. Cleanup: test rows deleted; your batch untouched (61 interns); all triggers on; Chrome stopped. |

## Decisions & trade-offs
- **All five as recommended:** Overview first but Interns the default; no Notice tracker button; the empty, waiting and loading states; Record conversation in place; the endpoint for anyone who can see the batch, the tab for managers.
- **Feedback to deliver leaves out read-only interns** (graduated, terminated, withdrawn): their feedback can never be delivered (10.2), so listing it would leave rows nobody can clear. Not in the plan; found while writing the API test.
- **The tab shows in archived batches** for admins and the PM. It only reads, so it follows "admin or PM" rather than `canManageBatch` (which is false once archived). Record conversation stays off there.
- **The colour bar shows only colours present**, so no zero-width segments add stray 2px gaps.
- In the half-width Feedback to deliver card, the "From … · date · waiting …" line wraps to two or three lines, as v2's layout would at that width.

## Deviations from plan
- Read-only interns' feedback left out of Feedback to deliver (above).
- Archived batches keep the tab (above).

## Not done / follow-ups
- **11.2 "My pending":** M26 (mentors: interns with no feedback this month) and P26 (the PM's To deliver).
- The Notice tracker (P5) and Imports (A25) tabs, if wanted later.
