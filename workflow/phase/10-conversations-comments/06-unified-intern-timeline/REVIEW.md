# 10.6 Unified intern timeline — Review

## What changed
| File | Notes |
|---|---|
| `interns/profile/feedback-entry.ts` | **`timelineEntries`** takes the status events: drafts first, then newest first by day; on the same day comments, status changes, conversations, feedback. **`statusChanges`** (onboarding left out), **`statusNote`** (the reason, plus " Runs until 8 Nov 2026." for a notice), **`pageSize`** (10), **`shownEntries`** (drafts always, then pages, and how many are hidden), **`pagesShowing`** (how many pages show a given entry). |
| `interns/profile/feedback-timeline.tsx` | **The status entry:** a `clock` rail on equal-ember-50, "Status changed [From] → [To] · who · day", and the note. **"Show earlier activity (N)"** (outline, sm, indented 46px). **The link reveal:** a comment's link and a conversation's "Delivers …" link first show the pages down to their entry (rendered with `flushSync`, so the browser's own jump then finds it). |
| `interns/profile/comment-entry.tsx` | A comment's link calls its target's `reveal`. |
| `ui/markdown.tsx` | A `muted` style: 13px muted, v2's note under a timeline entry. |
| `pages/intern-page.tsx` | Passes `intern.statusEvents`. "No feedback yet" only when there's no feedback and no status change but onboarding. |
| `design/README.md` | "The unified timeline (P6) as built in 10.6"; the 9.6 note corrected. |
| `pages/edit-feedback.test.tsx` | The card helper finds feedback cards by name, since a notice now shows as a status change above its feedback. |

## How to verify
```sh
pnpm check     # contracts 84 + web 389 + api 708
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** Web 389 (+10). Format and lint clean, with no suppressions; no new dependencies. |
| Units (4) | A status change above the feedback that caused it, after a same-day comment, onboarding left out; the note with and without "Runs until"; ten per page with drafts always shown and the hidden count (15, 5, 0); the pages that show an entry (1, 2, 3; never fewer than shown; drafts and unknown ids leave it). |
| UI (6) | **Status entries:** the order (comment, the lift, the notice, the feedback that gave it); "Status changed", the badges and their types, "· Rajesh Menon · 20 Oct 2026", the reason as Markdown, "Runs until 12 Nov 2026."; onboarding left out. **Empty state:** "No feedback yet" with only onboarding; the timeline for a withdrawal without feedback. **Paging:** 10 entries, "Show earlier activity (5)", then 15 and no button. **Reveal:** the comment's link to the oldest (hidden) entry renders it, and the button goes. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:** onboarding shown (4 tests); status changes below their feedback (2); the wrong hidden count (1); a link that doesn't reveal (1). |
| **Browser** (Compose, headless Chrome, test users only, then deleted) | Ishita with twelve entries (the last, Anjali's Red with notice, on 12 Oct), the PM's lift, and a comment on the 1 Oct entry. **First page:** 10 entries, the comment, "Status changed [On notice] → [Active] · Rajesh Menon · 28 Oct 2026" with "Back on **track** …", then "[Active] → [On notice] · Anjali Deshpande · 12 Oct 2026 … Runs until 28 Nov 2026." just above her feedback; the rail ember-50 with ember-700; the note 13px muted; **"Show earlier activity (5)"**, 32px outline, 46px in. **The link** to "Vikram Shetty’s feedback (1 Oct)" showed all 15 and scrolled the entry into view, with the hash set and the button gone. **The button** also showed all 15. Matches v2 P6's status entry. Cleanup: test rows deleted (the notice's event was backdated with triggers off for that one transaction, as the table is append-only); your batch untouched (61 interns); all triggers on; Chrome stopped. |

## Decisions & trade-offs
- **All four as recommended:** onboarding left out; the stored reason as the note; 10 per page in the browser; links reveal what they point at.
- **Paging state lives in the timeline**, so it resets when you leave the profile. Adding a comment or feedback keeps the pages already shown.
- **"Runs until"** uses the notice's stored end, so it always agrees with the side panel and Status history.

## Deviations from plan
- None in behaviour. Besides the planned files, `ui/markdown.tsx` gained a `muted` style for the note.

## Not done / follow-ups
- **Phase 11:** A24's "Feedback to deliver" and P26 (To deliver).
- Mobile (MM3) and API paging, if a record ever grows large.
