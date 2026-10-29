# 11.2 "My pending" view — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/src/pending.ts` | **`MyPending`**: `month`; `needsFeedback` (intern, batch, colour, last submitted feedback from anyone); `drafts` (id, intern, batch, period, body, colour, last edit); `toDeliver` (id, intern, batch, author, submission time, colour). |
| `feedback/application/pending-queries.ts`, `feedback-admin.ts`, `manage-feedback.ts` | The view type, `pending` in the feedback scope, and the use case **`myPending`** (month from the UTC date). |
| `feedback/infrastructure/drizzle-pending-queries.ts`, `drizzle-feedback-admin.ts` | Three reads over the batches you **currently mentor or run, started and not archived**, for interns **active or on notice**. Needs feedback: no submitted (or delivered) feedback **by you** for the month, with the latest from anyone (`DISTINCT ON`), by batch, then name. Drafts: yours, last edited first. To deliver: submitted feedback in the batches you're **PM** of, newest first. |
| `feedback/http/pending.routes.ts`, `app.ts` | `GET /me/pending` (signed in, `no-store`), photo ids turned into URLs. |
| `apps/web/src/api/pending.ts` | The query (exact key `['pending']`). |
| `ui/counter-badge.tsx`, `shell/nav-item.tsx`, `shell/sidebar.tsx` | Kuat **CounterBadge**; the nav item takes a count (none at 0; the link reads "My pending (4)"); **My pending** (`Inbox`) under Batches, for everyone. |
| `pending/pending.ts` | Tabs per role, the tab shown, the badge count, subtitle, "Last feedback" label, "12 interns", the draft line, "today / 1 day / 5 days". |
| `pending/pending-panels.tsx` | Needs feedback table, Drafts dashed cards, To deliver table, and their empty states. |
| `pending/pending-dialog.tsx` | Loads the batch, intern and feedback, then opens A7 (new, or **your draft for that intern**), A26 or A8 with the feedback chosen. |
| `pages/pending-page.tsx`, `app/routes.tsx` | `/pending` (crumb "My pending", `?tab=`): title, subtitle, tabs, Skeletons, the load error. |
| `give-feedback-dialog.tsx`, `discard-draft-dialog.tsx`, `record-conversation-dialog.tsx`, `status-dialog.tsx` | Each also refreshes the pending list (exact key), wherever it's used. |
| `interns/intern-link.tsx`, `batches/overview/overview-panel.tsx` | 11.1's `NameLink` moved to `InternNameLink`, shared by both pages. |
| `design/README.md` | "My pending (M26 / P26) as built in 11.2". |
| `app/login-flow.test.tsx`, `pages/status-change.test.tsx` | The nav now lists My pending; a status change reloads the pending list. |

## How to verify
```sh
pnpm check     # contracts 84 + web 426 + api 716
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** Web 426 (+22), API 716 (+6). Format and lint clean, with no suppressions; no new dependencies. |
| API (6) | Mo mentors A and B; also an archived batch, one starting in November, and one Mo left. **Needs feedback** for Mo: Bo, Cy, Ed, Fay. Ana is cleared by Mo's October feedback. Di (withdrawn) is out, as are the other three batches' interns. **Meg's** October feedback doesn't clear Bo, and **Mo's draft** doesn't clear Cy. Ed's last feedback is Mo's September entry (not this month). Delivered feedback still clears and leaves To deliver. **Drafts** are only your own, in current batches. **To deliver** for Pat is newest first, A and E only; Olu sees B's; Mo (mentor) sees none. An unassigned admin gets empty lists, `no-store`, and 401 signed out. Month at **1 Nov UTC** while it's 31 Oct in New York. |
| Units (6) | Tabs and counts per role; the asked tab or the first; the badge (PM → To deliver, otherwise Needs feedback); last-feedback labels ("· you", "No feedback yet"); "1 intern / 12 interns"; waiting in UTC days. |
| UI (16) | **Badge:** mentor 3, PM 2, none at 0. **Tabs:** mentor "Needs feedback 3, Drafts 1"; PM "To deliver 2, …" first; a mentor's `?tab=deliver` opens Needs feedback; both subtitles. **Needs table** rows, profile link, "3 interns". **Give feedback** opens an empty A7, submits, and reloads the list; for an intern with your draft, it opens on the draft. **Up to date** empty state. **Drafts:** the line, the plain excerpt and chip; Continue opens A7 on the draft; Discard → A26 → DELETE, and the list reloads; "No drafts.". **To deliver** rows ("today", "2 days"); Record conversation opens A8 with that feedback checked, saves `{ feedbackId }`, and the list reloads; the empty state. **The load error** and the **Skeletons**. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **15, all caught.** API (8): anyone's feedback clears an intern; archived batches included; not-started batches included; batches you've left included; your own draft clears; others' drafts listed; read-only interns listed; To deliver from batches you only mentor. Web (7): the badge always counting Needs feedback; a mentor getting To deliver from a link; no refresh after giving feedback, discarding, recording or a status change; Give feedback ignoring your draft. |
| **Browser** (Compose, headless Chrome, test users only, then deleted) | A batch with four interns, plus an archived batch with its own intern. **As mentor one:** badge 3; Needs feedback rows Ananya ("· Check Mentor Two"), Kavya ("· you", September), Rahul ("No feedback yet"); "3 interns"; the archived batch's intern left out. Gave Kavya feedback: the dialog closed, the row went, badge 2. Give feedback on Rahul opened **his draft**. Drafts: the dashed card (dashed slate-400, 16/18px), "Check Pending A · period Oct 2026 · edited 29 Oct", markdown stripped; Continue opened the draft; Discard → A26 → "No drafts.", "Drafts 0". **As the PM:** badge 4; "To deliver 4*"; rows newest first, "today". Record conversation on Ananya opened A8 with her feedback checked; saved, the row went, badge 3. **Found and fixed:** the button columns were v2's widths without the cells' 16px padding, so the buttons overflowed the table. They're now 16px inside on both tables. Matches v2 M26 / P26 apart from the decisions. **Cleanup:** test rows deleted; your batch untouched (61 interns); all triggers on; Chrome stopped. |

## Decisions & trade-offs
- **All five as recommended:**
  - only **your** submitted feedback for the month clears an intern;
  - the badge counts To deliver for a PM and Needs feedback for anyone else;
  - every row is shown, with "N interns" underneath;
  - the empty states;
  - Give feedback opens A7 here, on your draft if there is one.
- **"PM" is the role,** not the batch. Anyone holding the PM role gets the PM tabs and badge, as v2 shows one page per role. Their To deliver still covers only the batches they run.
- **Drafts of read-only interns aren't listed,** matching the other two lists. They stay on the intern's timeline, where Discard still works.
- **Delivered feedback counts as given.** A mentor whose October feedback was delivered stays cleared.
- **The dialogs refresh the list themselves,** not the page. Feedback given on a profile, or an intern who withdraws, updates the badge everywhere.
- **The API sends the draft's body.** The web shows the excerpt with the timeline's `excerpt` (markdown stripped), and blank drafts read "No text yet.".

## Deviations from plan
- **The action columns are 160px and 204px,** not v2's 130px and 170px: v2's widths leave out the cells' padding (found in the browser check).
- **The status dialog also refreshes My pending.** The plan named only feedback, drafts and conversations.

## Not done / follow-ups
- **Mobile (MM6)** and notifications are out of scope.
- **If a draft was discarded in another tab,** Continue on a stale card opens nothing until the list refreshes (at most 30s, or on any change).
