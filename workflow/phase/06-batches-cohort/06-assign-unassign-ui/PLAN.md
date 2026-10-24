# 6.6 Assign/unassign UI — Plan

**Phase:** 6 — Batches (cohort)
**Status:** Done

## Goal
Assign/unassign UI

## Done when
- **A batch's managers** (admins, and the batch's current PM) can assign and unassign its mentors from the batch page:
  - through the design's **Assign mentors** dialog (A11);
  - and through **Remove** on the Mentors table (A4).
- **Changes show at once:** the Mentors and Past members tables, and the batch list's counts and avatars.
- **Mentors and other viewers see no management controls,** and archived batches show none.
- Tests cover these. `pnpm check` passes, and the dialog and buttons match the design's measurements in the browser.

## What the design shows
- **The A2 header, for managers:** outline buttons on the right, **Import from Airtable** (Phase 7) and **Assign mentors** (a 16px `users` icon).
- **A11 Assign mentors** (Kuat Dialog, **560px**). The description: "Mentors see only the batches they are assigned to." Then a column with gap 12:
  - **a search field** (Kuat Input with a search icon, full width), "Search mentors";
  - **a bordered list.** Each row is padding 10px 12px, gap 12, with a 1px bottom border, and holds:
    - a **Checkbox** (ticked if assigned);
    - a 28px **Avatar**;
    - the name (14/500) over the email (12px muted);
    - on the right, the mentor's **load** (12px muted): "1 active batch", "1 upcoming batch" or "Unassigned".
  - **The footer** (1px top border, padding-top 16, space-between): "5 selected" (13px muted) on the left; on the right, an outline **Cancel** and a primary **Save mentors**.
  - **Order:** the batch's mentors first (ticked), then the others.
- **A4:** a ghost-muted `sm` **Remove** in a 110px column, for managers only.

## Decisions needed

### (1) Saving the dialog
The dialog's ticks describe the batch's **whole** mentor set.

| Option | What it means |
|---|---|
| **A. One new endpoint, `PUT /batches/:id/mentors` with `{ userIds }`** *(recommended)* | It sets the batch's current mentors to exactly that set: newly ticked people are assigned, unticked ones unassigned (their rows stay as history), and the rest are untouched. **One transaction:** if anyone can't be assigned (no Mentor role, inactive), nothing changes and the problem names them. The same rule as the other mentor routes: an admin, or the batch's current PM. |
| B. One request per change from the browser | No new endpoint, but a failure partway leaves some changes saved and some not. |

### (2) Who the dialog lists, and their "load"
A PM can't read the user list (admin-only), and shouldn't see other batches' names.

**Recommended: a new `GET /batches/:id/mentor-candidates`** (admin or the batch's current PM). It returns:
- **every active user with the Mentor role, plus the batch's current mentors even if inactive,** so an inactive mentor can be unticked;
- for each, their name, avatar and email;
- **the dates of the other batches they currently mentor** (no names). The page turns those into the load: "2 active batches", "1 active, 1 upcoming", "1 upcoming batch" or "Unassigned". Completed and archived batches don't count.

**Order:** current mentors first, then the others, each by name. It's fixed while the dialog is open, so rows don't jump when ticked.

### (3) Remove on the Mentors table
| Option | What it means |
|---|---|
| **A. Unassigns at once, without asking** *(recommended)* | It's easily undone (assign them again), it signs nobody out, and the row moves to Past members, so the result is visible. As with 5.3's Reactivate. The button is labelled "Remove \<name\>" for screen readers. |
| B. A confirmation dialog first | The same as 5.3's Remove user, but this is far less drastic. |

### (4) Changing the programme manager (not in the design)
The API can do it (6.3); the design has nowhere to.

| Option | What it means |
|---|---|
| **A. Leave it out until there's a design** *(recommended)* | Nothing improvised. Until then a PM can only be changed through the API. It's recorded as a follow-up. |
| B. Improvise a small "Change" link | A "Change" link after "Programme manager: Name" in the header, for admins, opening a dialog with Create batch's programme-manager select. |

### (5) Smaller points
- **Search** filters the list by name or email (ignoring case) and keeps the ticks.
- **"N selected"** counts the ticks.
- **Save mentors is disabled until something changes,** and shows "Saving…" while saving.
- **After saving,** the dialog closes and the page shows the server's answer straight away. The batch list is refetched for its counts and avatars.
- **Errors:** a refusal (e.g. someone just lost the Mentor role) shows in a Callout in the dialog with the API's message, and the ticks are kept.
- **Archived batches:** no Assign mentors and no Remove (the API would refuse).

## Plan

### Contracts
- **`SetMentorsRequest`** (`{ userIds: uuid[] }`, no duplicates).
- **`MentorCandidate`:** `{ id, name, email, avatarUrl, isActive, isAssigned, otherBatches: [{ startDate, endDate }] }`. Only current, unarchived batches are included; the page decides which count as active or upcoming.

### API (cohort)
- **Domain:** `setMentors(batch, { candidates, by, now })` assigns the missing ones and unassigns the rest, using `assignMember` and `unassignMember`, so the rules stay in one place. There's a unit test for the difference.
- **Use cases:** `setMentors` and `mentorCandidates`, both behind 6.4's visibility (404) and then "admin or current PM" (403).
- **Queries:** the candidates query (active Mentors plus current mentors, with other current batches' dates).
- **Routes:** `PUT /batches/:id/mentors` and `GET /batches/:id/mentor-candidates`.

### Web
- `api/batches.ts`: `mentorCandidatesQuery(id)`, `setMentors` and `unassignMentor`.
- `batches/assign-mentors-dialog.tsx`, `batches/mentor-load.ts` (load text from dates, tested), and `canManage(me, batch)` (admin, or the current PM, and not archived).
- **The batch page:** **Assign mentors** in the header and **Remove** in the Mentors table, for managers. The table gets the design's 110px action column, only when the viewer can manage.
- **Reused:** Dialog, Checkbox, Avatar, TextInput with a search icon, Button and Callout. No new UI primitives.

### Tests
- **API:**
  - `PUT /mentors`:
    - sets exactly the given set (assigns, unassigns, keeps);
    - is idempotent;
    - one ineligible user means 409 and nothing changes;
    - the batch's PM can use it; another PM gets 404, a mentor on the batch 403, and an archived batch 409;
    - duplicates are rejected (400).
  - `GET /mentor-candidates`:
    - active Mentors, plus an inactive current mentor;
    - other batches' dates, excluding archived and ended assignments;
    - the same access rules.
- **Web:**
  - **Visibility:** the buttons for an admin and for the batch's PM, none for a mentor on the batch or on an archived batch.
  - **The dialog:**
    - the list with current mentors ticked first, then by name;
    - load texts;
    - search;
    - the selected count;
    - Save disabled until a change;
    - **saving sends the full set and the tables update from the response**;
    - a 409 shows the Callout and keeps the ticks;
    - Cancel sends nothing.
  - **Remove** sends the unassign, and the mentor moves to Past members.
  - **Unit:** the load text.
- **Mutations** (on copies, restored with `cp`): saving the ticks without the existing mentors; the buttons shown to everyone; the load counting completed batches; and `setMentors` not unassigning. Each must fail a test.

### Out of scope
- **Changing the programme manager in the UI** (decision 4A), and Import from Airtable (Phase 7).
- **Feedback columns** on the Mentors table (Phase 8).

### Steps
1. Contracts, the domain's `setMentors`, the endpoints and their tests.
2. The load text, `canManage`, the dialog and Remove, with tests.
3. Docs (design/README, README API list). Run `pnpm check`, do the browser check (Compose, headless Chrome: the dialog's measurements, assigning and removing as an admin and as the batch's PM, and no controls for a mentor), and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- **In the browser:**
  - the 560px dialog, its rows, checkboxes, footer, the header button and Remove match the measurements above;
  - assigning and removing through the UI updates both tables and the list's mentor count.
- The test rows are deleted afterwards.
