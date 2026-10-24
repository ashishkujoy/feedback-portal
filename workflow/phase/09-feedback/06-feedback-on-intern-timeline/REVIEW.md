# 9.6 Feedback on intern timeline — Review

## What changed
| File | Notes |
|---|---|
| `apps/web/src/interns/profile/feedback-timeline.tsx` | **v2 P6's timeline**, feedback only (decision 1), in the API's order. An `ol` "Timeline" with v2's 32px **rail** (`message-square` on ee-blue-50, `pen-line` on slate-100 for a draft) and the line down to the next entry. **Feedback card:** "\<author\> gave feedback · \<day\> · period Oct 2026", Awaiting delivery / Delivered, the **colour change** (previous → new with a hidden "to"; a first colour alone; "Colour code unchanged" for no colour or the same colour, decision 2), the **Notice** badge, and the sanitized Markdown. **Draft card:** dashed, "Your draft · only you can see this · edited 23 Oct", Draft, an excerpt, **Continue editing** and **Discard**, without buttons once the viewer can't write feedback there (decision 3). A skeleton while loading. |
| `apps/web/src/interns/profile/feedback-entry.ts` (+ test) | The header line, "Oct 2026", "23 Oct", the colour change, the state badge, the excerpt (Markdown marks out, about 160 characters cut at a word) and the latest coloured feedback's day. |
| `apps/web/src/interns/profile/discard-draft-dialog.tsx` | **A26:** "Discard this draft?", "Your draft feedback for Ishita Rao (October 2026) is deleted. Only you could see it.", Cancel and **Discard draft** (destructive); `DELETE`, then the list refreshes; a refusal shows in the dialog. |
| `apps/web/src/pages/intern-page.tsx` | The timeline in the Timeline tab, the empty state for no feedback, "We couldn't load the feedback" on failure. One feedback dialog state: new, or `{ draft }` for Continue editing. |
| `apps/web/src/interns/profile/side-panel.tsx`, `interns/profile.ts` | "From the latest coloured feedback, 8 Oct 2026." (decision 4). |
| `apps/web/src/api/feedback.ts` | `discardFeedback`. |
| `apps/web/src/interns/give-feedback-dialog.tsx` | `draft` may be passed as `undefined`. |
| `ROADMAP.md`, `workflow/README.md`, `phase/09-feedback/08-edit-submitted-feedback/` | **New task 9.8, Edit submitted feedback** (decision 5g), with 5a–5f as agreed in its goal. |
| `design/README.md` | "Feedback on the timeline (P6, A26) as built in 9.6". |

## How to verify
```sh
pnpm check     # contracts 76 + web 324 + api 618
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 76 + 324 (+18) + 618. Format and lint clean, with no suppressions; no new dependencies. |
| Web tests (12 + 6) | **Order:** the draft, then feedback newest first. **Cards:** the header lines with the viewer's day and period, Awaiting delivery (info) / Delivered (success). **Colours:** Borderline Red → Red (with the hidden "to"), a first colour alone, No colour with "Colour code unchanged", the same colour again as one chip (unit). **Notice** only on notice feedback. A `<script>` in the text dropped, its heading kept. **Side panel** dated; plain when there's no list yet. Empty → "No feedback yet"; a failed load → the callout and detail. **Draft:** "only you can see this · edited 23 Oct", the excerpt; **Continue editing** opens A7 with its text and colour and `PUT`s on submit; **Discard** asks with A26's sentence, sends nothing until confirmed, then `DELETE`s and the draft leaves the list; **Cancel** keeps it; a 409 shows "We couldn't discard the draft" with the detail; **a read-only intern's draft has no buttons.** Units: excerpt cutting, latest coloured day ignoring drafts and no-colour entries. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:** the previous chip dropped (2 failing tests); Notice never shown (1); Discard without asking (2); drafts after submitted feedback (9). |
| **Browser** (Compose, headless Chrome, test users only, then deleted) | A first colour (Borderline Red, Sep), a change with notice (Borderline Red → Red, Notice), a no-colour entry, and a mentor's draft. **As that mentor:** the draft first (dashed, edited 24 Oct, excerpt, both buttons), then the three entries newest first; the rail 32px with lines except after the last; chips in REF-1's tints; the side panel "From the latest coloured feedback, 24 Oct 2026.". **Another mentor** sees the three entries, not the draft. **Continue editing** opens A7 with the draft's text and Orange; submitting turns it into "Red → Orange" at the top and the side panel into Orange. **A blank draft** shows "No text yet."; **Discard** opens A26 (460px, destructive Discard draft); Cancel keeps it; Discard draft removes it. |

## Decisions & trade-offs
- **Decisions 1–4 as recommended.** **Decision 5:** anything in submitted feedback can change until it's delivered; that's **task 9.8** (5g), with 5a–5f as recommended.
- **"Delivered" has no date yet:** v2's "Delivered 10 Oct" needs the conversation, which Phase 10 records.
- **Not in v2:** "No text yet." for a blank draft's excerpt, and the rail's line stopping at the last entry (v2's runs on to "Show earlier activity", which isn't built).

## Deviations from plan
- None in behaviour. Older profile tests now stub the feedback list, and two wait for it to load before looking for the empty state.

## Not done / follow-ups
- **9.8:** editing submitted feedback (an Edit button on the author's undelivered cards).
- **10.x:** conversations, comments and status changes on the timeline, "Delivered \<date\>", and paging.
