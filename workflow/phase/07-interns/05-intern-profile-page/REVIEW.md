# 7.5 Intern profile page — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/src/intern.ts` (+ test) | **`InternStatusEvent`** (with `actor: { id, name }`) and **`InternDetail`**: `InternSummary` plus phone, diploma branch, parents' names, interview notes, `source` (`manual` / `airtable`), `createdAt`, `addedBy`, and `statusEvents` newest first. |
| `apps/api/src/modules/intern/application/intern-queries.ts`, `infrastructure/drizzle-intern-queries.ts` | **`detail(batchId, internId)`** reads the intern **only within that batch**, then its events (newest first) joined to `users` for the actors' names. Cohort's queries already read `users` the same way. `source` comes from `airtableRecordId`, and `addedBy` is the onboarding event's actor. |
| `intern/application/manage-interns.ts`, `http/interns.routes.ts`, `intern-views.ts` | **`getIntern`:** `BatchAccess` first (not visible → 404), then the detail (missing or another batch's → 404). **`GET /batches/:batchId/interns/:internId`** → `InternDetail`. |
| `apps/web/package.json` | **`react-markdown` 10.1.0, `remark-gfm` 4.0.1, `rehype-sanitize` 6.0.0**, pinned exactly. They were published 2025-03-07, 2025-02-10 and 2023-08-26, well past the release-age rule. `pnpm-workspace.yaml` is unchanged (checked with `diff`). |
| `apps/web/src/ui/markdown.tsx` (+ test) | **Sanitized Markdown** with v2's prose styles (14/22; headings 15px/600; 10px between blocks; lists indented 20px; mono inline code on slate 100; links open in a new tab with `noopener noreferrer`). Each element gets only its children (and `href`), never react-markdown's `node` or other props. |
| `apps/web/src/app/routes.tsx` | **The batch route is now a parent:** its loader and crumb stay, its index is the batch page (with 7.4's search params), and **`interns/$internId`** is the profile. The profile's loader turns a 404 into "Page not found" and adds the intern's crumb; `?tab=details\|history` is kept in the URL. |
| `apps/web/src/pages/intern-page.tsx`, `interns/profile/*` | **The header** (a 64px avatar, the name with its status badge, `@username` in mono · the batch). **The notice banner** (`warning`) and **the final banner** (`info`). **The tabs:**<br>• **Timeline**, the dashed placeholder;<br>• **Details**, the 2-column card and the Interview notes card;<br>• **Status history**, newest first, with from → to badges, "by …" and the reason in Markdown.<br>**The side panel:** the colour code with the notice period bar, and the mentors. |
| `apps/web/src/interns/profile.ts` (+ test) | Pure texts: the status badges, the first name, the notice banner and the final banner, "N of M days left", "Added …", the onboarding reason, and the colour code note. |
| `interns/intern-link.tsx`, `intern-card.tsx`, `roster-table.tsx` | **Roster names link to the profile,** on both the cards and the table. |
| `api/interns.ts`, `ui/avatar.tsx` | `internQuery`; Avatar gains **`xl`** (64px). |
| `ROADMAP.md`, `workflow/README.md`, `phase/07-interns/09-edit-intern-details/` | **7.9 Edit intern details** added (decision 4). |
| `README.md`, `design/README.md` | The endpoint, and **"Intern profile as built in 7.5"**. |

## How to verify
```sh
pnpm check     # contracts 65 + web 203 + api 482
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 65 (+2) + 203 (+28) + 482 (+4). Format and lint clean, with no suppressions. |
| Routes (4, Testcontainers) | **200 with everything:** details, `source: manual`, `addedBy`, and events newest first with reasons, notice dates and actors' names, after a notice was given through the domain. **200 for the PM, a mentor on the batch and an admin.** **404:** a user not on the batch, an unknown intern, and **this intern under another batch's URL**. 401 signed out. |
| Markdown (3) | Headings, lists, bold, inline code and links (with `rel`). **`<script>`, `<img onerror>`, `<b onclick>` and a `javascript:` link** are all dropped. GFM tables and strikethrough render. |
| Profile texts (13) | Each status badge. The notice banner (15 days left; ended; absent when not on notice). The final banner for graduated, terminated and withdrawn (absent otherwise). "15 of 31 days left" and "0 of 31". "Added by … / Imported from Airtable, …". The onboarding reason both ways. The first name. The colour code note. |
| Web pages (12) | The header and crumbs (the batch crumb links back). The Timeline placeholder, with no Give feedback. Details with "—" for a missing field and `?tab=details`. **Interview notes as Markdown, with no `script`, `b` or `onclick`.** "No interview notes.". Status history, with its count, newest first, with the Markdown reason. The notice banner, colour and notice period. The withdrawn banner. The side panel's colour and mentors. A 404 is "Page not found". **Roster links on the cards and the table** open the profile. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **Caught:**<br>• the batch condition dropped from `detail` (another batch's intern was served);<br>• the visibility check dropped (an outsider saw it);<br>• the history oldest first;<br>• the withdrawn banner missing (texts and page).<br>**Markdown, honestly:** removing rehype-sanitize alone is *not* caught. react-markdown already escapes raw HTML and drops unsafe URLs, so sanitizing is a second layer. **With both layers removed** (no sanitize, and URLs passed through), the `javascript:` test fails. **With only react-markdown's layer removed**, rehype-sanitize still blocks it. Each layer holds on its own. |
| **Browser** (Compose, headless Chrome at 1440; as the PM, then a mentor; three interns added through the API, then a notice and a graduation recorded directly in the database as status events) | **The roster link** opened `/batches/…/interns/…`. Crumbs: Batches › Check Batch Main › Ishita Rao. 64px avatar (25.6px initials); name 28/36/600; `@ishita.rao` in mono · the batch. **Tabs:** Timeline, Details, "Status history 1". **Layout** 820px + 300px. **Placeholder:** dashed `slate-300`, 56px padding, "…for Ishita appear here, newest first." **Side cards:** padding 18 and gap 12; labels 12px/600 uppercase at 0.06em. "No colour yet / Set by the first coloured feedback."; "2 mentors in this batch". **Details:** 2 columns with 32px × 20px gaps and padding 20; the header 14px 20px; all six fields with "Added by Rajesh Menon, 24 Oct 2026". **Notes:** h3 15px/600 (6px below), lists, bold, mono 12.5px code on slate 100; **the `<script>` in the notes never reached the page**. **On notice:** "On notice until 8 Nov 2026 · 15 days left" and "Issued by Anjali Deshpande on 8 Oct 2026. Nothing happens automatically when it ends: Rajesh Menon, the programme manager, lifts it or terminates."; the badge "On notice"; Red; "15 of 31 days left" with a 48% `equal-ember-500` bar. **History:** Active → On notice by Anjali Deshpande with a bold "September", then "Added by hand.". **Graduated:** "This intern graduated on 24 Oct 2026. Their record is read-only." **As the mentor:** the profile with no buttons. **An unknown intern id:** "Page not found". |
| Clean-up | Test users, sessions, the batch, interns and events deleted. The trigger was bypassed only inside the cleanup transaction, and is still enabled. Only your account (and its own session) remains. Chrome stopped; tokens, screenshots and the workspace copy removed. |

## Decisions & trade-offs
- **All six decisions as recommended.** 7.9 is on the roadmap and board.
- **Markdown has two layers:** react-markdown never renders raw HTML and drops unsafe URLs, and rehype-sanitize filters what's left. The mutation check showed each holds alone.
- **Status reasons render as Markdown too** (DATA_MODEL: reasons are Markdown), with the same component.
- **"N mentors in this batch"** rather than v2's "active mentors". The count is current assignments, which can include an inactive user (6.6).
- **Only the name is a link** on cards and rows. A whole-card link would wrap a future Give feedback button.
- **The browser data recorded the notice and graduation as event rows** (7.6 adds the endpoint), consistent with the interns rows and their checks.

## Deviations from plan
- **The batch route became a parent** (index + profile), so the breadcrumb nests naturally and the batch loader runs once for both pages. `BatchPage` now reads the `/app/batches/$batchId/` route.
- **The plan's sanitizing mutation** turned out to need both layers removed (above).

## Not done / follow-ups
- **7.9 Edit intern details (A15).** **7.6:** status actions in the header (the history already shows their effect). **7.7:** the photo. **Phase 9:** the timeline, Give feedback, the colour history and linked feedback.
- **The mobile profile (MM3).**
