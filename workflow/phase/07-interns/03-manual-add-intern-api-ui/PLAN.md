# 7.3 Manual add intern API + UI — Plan

**Phase:** 7 — Interns
**Status:** Done

## Goal
A fallback when Airtable isn't available

## Done when
- **`POST /batches/:batchId/interns`** adds an intern to a batch, through 7.2's `onboardIntern`, and saves the intern and its onboarding event (7.1).
- **Only the batch's managers can add interns** (admins and the batch's current PM, as for Airtable imports, PRODUCT §7 row 5), and only to a batch that isn't archived. A batch the user can't see is a 404 (6.4).
- **The batch page has the design's Add intern button and dialog (A14),** validated by the shared contract.
- **`design/README.md` and `CLAUDE.md` point at the new design files** (v2), with an index of v2's screens.
- API, repository and web tests pass, and `pnpm check` passes. The dialog matches A14 in the browser.

## The design: v2 (added 2026-10-24)
The design project now has **`Mentor Portal v2.dc.html`** (the canvas: about 80 artboards, IDs `A14`–`A29`, `P18`–`P26`, `M26`, `MM6`, with suffixes for states) and two new component files: **`Portal Screen.dc.html`** and **`Portal Dialog.dc.html`**. **They formalise the screens built without a design so far and cover the future roadmap** (roster, profile, status dialogs, import, feedback, pending, dashboard, and more). The v1 files stay in the project.

### What A14 Add intern shows
- **Where:** an outline **Add intern** button (16px `plus` icon) in the batch header for managers. The order is **Archive batch** (ghost-muted, admins), **Add intern**, **Import from Airtable**, then **Assign mentors**. **7.3 adds only Add intern;** Import is Phase 8, and Archive is a follow-up.
- **The dialog:** Kuat Dialog, **560px**, title "Add intern", description "Use this when the intern isn't in Airtable. Later imports match interns by username."
- **Fields** (Kuat Field: label, control, help or error; gap 16):
  - **Username**, required: an Input with an "@" left icon, in the mono font, with the help text "Lowercase, as in Airtable.";
  - **then a 2-column grid (gap 12):** **Full name** (required), **Email**, **Phone** (`tel`) and **Diploma branch**;
  - **Parents' names**;
  - **Interview notes:** a Kuat Textarea, 5 rows, in the mono font, with the help text "Markdown supported.".
- **Footer:** outline Cancel, and primary **Add intern**.
- **Error state (A14-errors):** "This username is already in the batch." under Username.
- **Success state (A14-success):** the form is replaced by a `positive` Callout ("\<Name\> added to \<Batch\>", then a sentence) with outline **Add another** and primary **Done**.

## Decisions needed (where A14 and what's built differ)

### (1) Is email required?
A14 marks only Username and Full name as required. 7.1's `interns.email` is `NOT NULL` (DATA_MODEL: "email, lower-cased"), and 7.2 requires it.

| Option | What it means |
|---|---|
| **A. Keep email required** *(recommended)* | It matches DATA_MODEL and what's built. Airtable records include it (PRODUCT §7). The dialog marks Email as required, which differs from A14 only by an asterisk; that's recorded in design/README. |
| B. Make email optional, as A14 shows | A migration (`email` nullable, the lower-case check kept), 7.2's rule changed, and every later screen showing an email handles none. |

### (2) Usernames in lower case
A14's help text says "Lowercase, as in Airtable." 7.2 keeps the case given and matches ignoring case.

**Recommended: store usernames lower-cased** (7.2's rule gains `.toLowerCase()`; `@Ishita.Rao` → `ishita.rao`). Then what's shown matches Airtable and the help text. Matching was already case-insensitive, so nothing else changes.

### (3) The success sentence
A14's sample sentence uses "She's" and mentions the roster, feedback and photos.

**Recommended: "\<Name\> is on the roster as Active, with no colour code."**
- **No pronoun:** the app can't know one.
- **No promise of features that don't exist yet:** feedback and photos are Phases 9 and 7.7.
- **The roster** arrives in 7.4, the next task.

The title stays "\<Name\> added to \<Batch\>".

## Plan

### Docs
- **`design/README.md`:**
  - **v2's files:** the canvas, `Portal Screen` and `Portal Dialog`, and how to read them (their `screen`/`dialog`/`state` props);
  - **an index of v2's screens by ID and section;**
  - **a "Built before v2" list:** screens built from v1 or improvised, which v2 has now formalised. They're to be compared when each area is next touched (follow-ups, not this task).
- **`CLAUDE.md`:** "Main file" and "screens" point at v2's three files; v1 is kept for reference.

### Contracts
- **`CreateInternRequest`:** the same rules as 7.2's details (username: "@" removed, lower-cased, `[a-z0-9._-]`, 1–50; name; email; optional fields), so the form checks them first.
- **`InternSummary`:** `{ id, batchId, username, name, email, status, colorCode, noticeEndsOn }`.
- **Error code `intern_username_taken`.**

### API (intern module)
- **7.2's `Details`:** usernames lower-cased (decision 2), with its test updated.
- **`application/intern-repository.ts`:** `save(intern)` inserts or updates the intern's columns and **inserts only the events it doesn't have yet** (7.1's trigger forbids updates). It maps `interns_batch_username_unique` → `intern_username_taken`. Also `findById`.
- **`application/batch-access.ts`:** a port answering "can this viewer see the batch, may they manage it (admin or its current PM), and is it archived?". **Cohort's infrastructure implements it** with 6.4's visibility condition, and `main.ts` wires it in.
- **`application/add-intern.ts`:** **not visible → 404, not a manager → 403, archived → 409 `batch_archived`.** Then `onboardIntern` (the actor recorded on the onboarding event) and save.
- **`http/interns.routes.ts`:** `POST /batches/:batchId/interns` → **201** `InternSummary` with `Location`, mounted in `app.ts`. Logs carry ids only.

### Web
- `api/interns.ts`: `addIntern(batchId, body)`.
- **`ui/textarea.tsx`** (Kuat Textarea: padding 10px 12px, `--radius-sm`, 14/21, resizable vertically, with the Input's border and focus ring), and **`TextInput`** gains a mono option for the username.
- **`interns/add-intern-dialog.tsx`:** A14 exactly, with the decisions above. **Add another** resets the form and focuses Username; **Done** closes.
- **The batch page:** an **Add intern** button (outline, `plus`) for managers, placed where A2 puts it. **`canManageMentors` becomes `canManageBatch`** (the same rule).

### Tests
- **Repository** (Testcontainers):
  - round-trips an intern with its onboarding event;
  - saving again adds only new events;
  - a taken username (another case) in the same batch → `intern_username_taken`;
  - the same username in another batch → saved.
- **Routes:**
  - **201** with the normalised intern (`@Ishita.Rao` → `ishita.rao`, the email lower-cased) and `Location`;
  - the onboarding event recorded with the actor;
  - all invalid fields together (400);
  - a taken username (409);
  - **access:** 401 signed out; a mentor on the batch → 403; a PM not on it → 404; the batch's PM → 201; an admin → 201;
  - an archived batch → 409; an unknown batch → 404.
- **Web:**
  - the button for the batch's PM and an admin, not for a mentor or on an archived batch;
  - A14's fields, help texts, required markers and focus;
  - nothing sent while invalid;
  - success shows the Callout, then **Add another** gives an empty form and **Done** closes;
  - "This username is already in the batch." under Username;
  - a 500 in a Callout;
  - Cancel sends nothing.
- **Mutations** (on copies, restored with `cp`): the manager check removed; the archived check removed; events re-inserted on every save; `intern_username_taken` not mapped; the username not lower-cased. Each must fail a test.

### Out of scope
- **The roster (7.4),** which also moves the Mentors and Past members tables into the Mentors tab (A2-asbuilt / A4).
- **The profile (7.5),** with Edit details (A15). **Status dialogs (7.6, P18–P21). Photos (7.7). Import (Phase 8).**
- **Archive batch (A17) and Change programme manager (A16):** v2 now designs them. They're follow-ups, to be added to the roadmap when you choose.
- **Bringing already-built screens in line with v2.** They're listed in design/README as follow-ups.

### Steps
1. Docs: v2 in design/README and CLAUDE.md.
2. Contracts, the username rule, and the repository, with tests.
3. The batch-access port, the use case and the route, with tests.
4. The Textarea, the dialog and the batch page, with tests.
5. Run `pnpm check`, do the browser check (Compose, headless Chrome, as the batch's PM: A14's measurements, adding, the duplicate error, Add another / Done, and no button for a mentor), and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- **In the browser,** the dialog matches A14, and the database has the intern (username lower-cased) and its onboarding event.
- The test rows are deleted afterwards.
