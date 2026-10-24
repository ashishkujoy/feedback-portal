# 7.5 Intern profile page — Plan

**Phase:** 7 — Interns
**Status:** Done

## Goal
Details, interview notes, and a timeline placeholder

## Done when
- **`GET /batches/:batchId/interns/:internId`** returns one intern, for anyone who can see the batch. It includes their details, interview notes, how they were added, and their status history with who made each change. A batch the viewer can't see, or an intern not in that batch, is a **404**.
- **The profile page at `/batches/:batchId/interns/:internId`** follows v2 (P6 / M6, P22, P23, A6 states) for what exists now:
  - the header;
  - the notice and read-only banners;
  - three tabs: **Timeline** (a placeholder), **Details** with the **interview notes rendered as Markdown**, and **Status history**;
  - the side panel.
- **Roster cards and rows link to the profile** (7.4 decision 5).
- API and web tests pass, and `pnpm check` passes. In the browser, the page matches v2 for an active intern, one on notice and a graduated one.

## What v2 draws
- **Breadcrumb:** Batches › \<batch\> › \<intern\>.
- **Header:**
  - a 64px avatar; the name (28/36, 600) with a status badge (Active `info`, On notice `error`, Graduated `success`, Terminated / Withdrawn `neutral`);
  - then `@username` (mono) · the batch name · **Add / Change photo** (7.7);
  - on the right, **status actions** (7.6, the batch's PM only) and **Give feedback** (Phase 9).
- **Banners:**
  - **On notice** (`warning`): "On notice until \<end\> · N days left", then "Issued by \<who\> with \<colour\> feedback on \<date\>. Nothing happens automatically when it ends: \<PM\>, the programme manager, lifts it or terminates."
  - **Final** (`info`): "This intern graduated / was terminated / withdrew on \<date\>. Their record is read-only.", then "Feedback, conversations and comments stay visible. Nothing can be added or changed."
- **Tabs:** Timeline, Details, Status history (with a count).
- **Body:** the tab content, with a 300px side panel to its right (gap 24).
- **Timeline, empty (A6-nofeedback):** a dashed box: "No feedback yet", then "Feedback, conversations, comments and status changes for \<first name\> appear here, newest first.", and **Give feedback**.
- **Details (P22):**
  - a bordered card headed "Details" with **Edit details** (A15), then a 2-column grid (20px × 32px) of 12px muted labels over 14px values: Username, Email, Phone, Diploma branch, Parents' names, and **Added** ("Added by \<who\>, \<date\>" or "Imported from Airtable, \<date\>");
  - then an "Interview notes" card with the Markdown rendered.
- **Status history (P23):**
  - "Status history", then "Every change is kept. Entries can't be edited.";
  - one row per change, newest first: the date (120px), then from-badge → to-badge "by \<who\>", the reason, and "Linked feedback: …" when there is one.
- **Side panel:**
  - **Colour code:** a 14px dot, the label at 20/600, and a 13px note ("No colour yet" / "Set by the first coloured feedback.");
  - while on notice, **Notice period** with "N of M days left" and a 6px `equal-ember` bar;
  - **Colour history** (Phase 9);
  - **Mentors:** an avatar stack and "N active mentors in this batch".

## Decisions needed

### (1) What's left out until its task
**Recommended: show only what has data now.** Leave out until their tasks:
- status actions (7.6);
- Give feedback (Phase 9), including in the Timeline placeholder;
- the photo button (7.7);
- the colour history and "Linked feedback" (Phase 9).

As in 7.4, no button leads nowhere.

### (2) The Timeline placeholder
**Recommended: v2's empty state without its button.** "No feedback yet", then "Feedback, conversations, comments and status changes for \<first name\> appear here, newest first."

The first name is the first word of the name. No pronoun is needed.

### (3) Status history now or in 7.6
**Recommended: now.** The events already exist (7.1 to 7.3), the tab is read-only, and 7.6's changes will show up in it with no further UI work.

The onboarding event has no reason, so its row reads "Added by hand." or "Imported from Airtable.", depending on how the intern arrived.

### (4) Edit details (A15)
The roadmap doesn't list editing until now, but a typo from Add intern can't be fixed yet.

| Option | What it means |
|---|---|
| **A. A follow-up task** *(recommended)* | Keep 7.5 read-only, and add **7.9 Edit intern details (A15)** to the roadmap now. |
| B. Include it in 7.5 | A bigger task: a `PATCH` endpoint, the A15 dialog and its errors. |

### (5) The banners' wording
- **On notice:** v2's sentence, except "with \<colour\> feedback", which needs feedback (Phase 9). Until then: "Issued by \<who\> on \<date\>. Nothing happens automatically when it ends: \<PM\>, the programme manager, lifts it or terminates."
- **Final:** as v2.
- **Recommended:** keep v2's words wherever the data exists.

### (6) The colour code note
- **No code:** "Set by the first coloured feedback.", as v2.
- **A code set:** "From the latest coloured feedback.", without v2's date, since the feedback that set it comes in Phase 9.

  This can't happen through the app yet. Codes only arrive with feedback, so for now it's only in tests.

## Plan

### Contracts
- **`InternDetail`:**
  - `InternSummary` plus `phone`, `diplomaBranch`, `parentNames`, `interviewNotes`;
  - `source` (`manual` or `airtable`), `createdAt` and `addedBy` (`{ id, name }`);
  - `statusEvents`: `[{ id, fromStatus, toStatus, reason, noticeStartsOn, noticeEndsOn, actor: { id, name }, createdAt }]`, newest first.

### API (intern module)
- **`intern-queries.ts`:** `detail(batchId, internId)` loads the intern of *that* batch and its events, with the actors' names. As cohort's queries already do, this joins `users` for display names only.
- **The `getIntern` use case:** `BatchAccess` (not visible → 404), then the detail (missing or in another batch → 404).
- **`GET /batches/:batchId/interns/:internId`** → 200 `InternDetail`.

### Web
- **Dependencies** (per TECH_STACK): **`react-markdown`, `remark-gfm`, `rehype-sanitize`**, each pinned to a version more than a day old (the release-age rule).
- **`ui/markdown.tsx`:** sanitized rendering with no raw HTML, and prose styles from Kuat's type scale (headings, lists, `code`, links). It's reused by feedback later.
- **`api/interns.ts`:** `internQuery(batchId, internId)`.
- **Route** `/batches/$batchId/interns/$internId`:
  - a loader turns a 404 into "Page not found";
  - the crumbs read Batches › \<batch\> › \<intern\>;
  - `?tab=details|history` is kept in the URL (Timeline is the default).
- **`pages/intern-page.tsx`, `interns/profile/*`:**
  - the header and banners (StatusBadge, Callout);
  - the Kuat Tabs (Status history with its count);
  - the Timeline placeholder, the Details and Interview notes cards, the Status history list;
  - the side panel (Colour code, notice period, and Mentors from the batch already loaded).
- **Pure helpers (tested):**
  - the status label and badge type;
  - the banner texts;
  - "N of M days left";
  - the "Added" text;
  - the onboarding row's reason;
  - the first name.
- **Roster links:** each card's name and each table row's name become a link to the profile (`Link`, keyboard-reachable). The rest of the card isn't clickable, which avoids nesting interactive elements.

### Tests
- **Routes (Testcontainers):**
  - 200 with details, `source`, `addedBy` and events newest first, with actor names, for the PM, a mentor on the batch and an admin;
  - **404:** a user not on the batch, an unknown intern, and **an intern from another batch under this batch's URL**;
  - 401 signed out.
- **Pure helpers:** each status's badge and banner; days left (15 of 31, 0, ended); "Added" both ways; the onboarding reason both ways; the first name.
- **Web:**
  - the header (64px avatar, badge, `@username · batch`);
  - the crumbs;
  - the tabs and `?tab=` in the URL;
  - the Timeline placeholder with the first name;
  - Details with every field ("—" for a missing one) and "Added";
  - **interview notes rendered as Markdown, with a `<script>` and an `onclick` stripped**;
  - Status history newest first, with badges, "by …" and the reasons;
  - the on-notice banner and notice period; the final banner;
  - the side panel's mentors;
  - roster cards and rows link to the profile;
  - a 404 shows "Page not found".
- **Mutations** (on copies, restored with `cp`):
  - the batch check removed (an intern seen under another batch);
  - the visibility check removed;
  - events oldest first;
  - Markdown rendered without sanitizing;
  - the final banner missing for withdrawn.

  Each must fail a test.

### Out of scope
- **Status changes (7.6)** and **photos (7.7)**.
- **Feedback, the real timeline and the colour history** (Phase 9).
- **Edit details:** a follow-up (decision 4).
- **The mobile profile (MM3).**

### Steps
1. Contract, query, use case and route, with tests.
2. Dependencies (versions checked against the release-age rule, with a `diff` of `pnpm-workspace.yaml`) and the Markdown component, with sanitizing tests.
3. The route, page, tabs, side panel and roster links, with tests.
4. Run `pnpm check`, run the mutations, do the browser check (Compose, headless Chrome: as the PM with an active intern with rich notes, one on notice and a graduated one, set directly in the test database; as a mentor), and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- In the browser, the profile matches v2's P6/P22/P23 and A6 states for what's built.
- The test rows are deleted afterwards.
