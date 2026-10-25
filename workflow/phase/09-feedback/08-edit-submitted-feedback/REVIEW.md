# 9.8 Edit submitted feedback — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/drizzle/0007_drop_previous_color.sql`, `0008_feedback_edited_at.sql`, `feedback/infrastructure/schema.ts` | **`previous_color_code` dropped** with its check (decision 1). **`edited_at`** added, with a check that a draft has none. Two migrations, because drizzle-kit otherwise asks interactively whether the new column renames the old one. |
| `packages/contracts/src/feedback.ts`, `intern.ts`, `problem.ts` | **`FeedbackEditRequest`** (month, text, colour, notice; no `submit`) replaces `FeedbackBodyRequest`. **`FeedbackView.editedAt`**. **`InternStatusEvent.feedbackId`**, so the dialog can tell which feedback gave the running notice. A new code, **`notice_not_running`**. |
| `feedback/domain/feedback.ts` | **`editSubmitted`** replaces 9.3's text-only edit. It allows the author only, while submitted, for an intern who isn't read-only. It checks the content and month as on submit. **No change, no `editedAt`.** **Notice on:** from `range.today`, "Notice given by editing the October 2026 feedback.", linked to the feedback, Active interns only. **Notice off:** only when the running notice came from this feedback, giving "Notice withdrawn by editing the October 2026 feedback." (On notice → Active), else 409. The `previousColorCode` snapshot on submission is gone. |
| `intern/domain/intern.ts` | **`followColour`**: the colour of the newest coloured feedback, which can go back to none. Unchanged, the same intern comes back. |
| `feedback/infrastructure/drizzle-feedback-queries.ts`, `drizzle-feedback-repository.ts`, `feedback-repository.ts` | **`previousColorCode` is worked out when read:** the colour of the coloured, non-draft feedback submitted just before, by `(submitted_at, id)`. **`newestColour(internId)`**. `edited_at` is read and written. |
| `feedback/application/manage-feedback.ts`, `http/feedback.routes.ts` | **`PATCH …/feedback/:id`** takes `FeedbackEditRequest`. It locks the intern (as on submit), saves the feedback and any notice change, then sets the intern's colour to the newest coloured feedback's. |
| `intern/…/intern-queries.ts`, `drizzle-intern-queries.ts`, `intern-views.ts` | Status events carry `feedbackId`. |
| `apps/web/src/api/feedback.ts`, `interns/give-feedback-dialog.tsx`, `interns/feedback-form.ts` | `editFeedback`. **The dialog's edit mode** (`FeedbackTarget`: new, draft or edit): the title, the description, Save changes only, and "We couldn't save your changes". **`editNoticeSwitch`** gives the switch's wording and its lock; **`editColourHelp`** gives the colour help. Saving refreshes the feedback, the intern, the roster and the counts (exact keys). |
| `interns/profile/feedback-timeline.tsx`, `feedback-entry.ts`, `pages/intern-page.tsx` | **Edit** on the viewer's own Awaiting-delivery cards (`isEditableBy`), only where they can still write. **"· edited"** in the header line. The page's dialog state is one `FeedbackTarget`. |
| `PRODUCT.md`, `design/README.md` | The lifecycle (the author edits until delivery); "Editing submitted feedback (A7, P6) as built in 9.8". |

## How to verify
```sh
pnpm check     # contracts 80 + web 350 + api 650
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** Contracts 80, web 350 (+8), API 650 (+12 net). Format and lint clean, with no suppressions; no new dependencies. |
| Domain tests (30) | **Edits:** month, text and colour change, with `editedAt` set and the intern untouched by the domain. **No change** returns the same feedback. **Rules:** another mentor 403, blank text, a month after this one, a draft, a read-only intern. **Notice on:** from 24 Oct to 24 Nov, linked to the feedback; refused while on notice. **Notice off:** back to Active, with the September wording when the month changed. **Lifted or replaced:** `notice_not_running`, and other edits still allowed with notice left on. `followColour` back to none. |
| API tests (feedback 24) | **Colour:** editing an older entry leaves the intern Orange and the next entry's previous colour follows (Yellow → Green). Editing the newest moves the intern. **Three entries with a no-colour one between** read Orange as the newest's previous colour. **The newest losing its colour** gives back Yellow, then none. **Notice** on from the edit day and off again, with three history entries in order. **Lifted by the PM** gives 409 with the history kept. **Access:** another mentor and the PM get 403; delivered gets 409. **No change** isn't marked edited; the month range is enforced. **An edit giving notice racing a new notice:** exactly one succeeds. The old tests pass with the new `PATCH`. |
| Web tests (8 new) | Edit only on the viewer's own submitted card (not a draft, delivered feedback or someone else's), and none for a read-only intern. "· edited". **The dialog** is filled in, with Save changes only and the edit help; it sends a `PATCH` without `submit` and refreshes the list and the intern. **Notice:** on from save; a running own notice can be switched off ("Saving withdraws…"); a lifted one is locked with "This notice was lifted on 22 Oct 2026…". A refusal keeps the text. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:** the intern's colour always following the edited entry (2 failing tests); withdrawing without checking that this feedback gave the notice (2); `editedAt` set with no change (2); the previous colour taken from the first coloured entry instead of the one just before. **That last one survived at first** (two entries can't tell them apart), so a three-entry test was added, which catches it. |
| **Browser** (Compose, headless Chrome, test users only, then deleted) | Anjali's Yellow (Sep), Vikram's no-colour entry, Anjali's Orange (Oct). **As Anjali:** Edit on her two cards only. The dialog reads "Edit feedback for Ishita Rao", has Cancel and Save changes, and is filled in. **Orange → Red:** "· edited", the chip Yellow → Red, the side panel Red. **Older Yellow → Green:** the newest chip now Green → Red, the intern still Red. **Notice on:** On notice ("Ends 25 Nov 2026…"). **Off:** "Runs until 25 Nov 2026…", then "Saving withdraws…", and Active. **On again, then the PM lifts it:** the switch is locked on, "This notice was lifted on 25 Oct 2026, so it can't be withdrawn here.". **Status history:** given, withdrawn, given, lifted, each by the right person. **As Vikram:** Edit only on his own card. Cleanup: test rows deleted; your batch and accounts untouched; both triggers on; Chrome stopped. |

## Decisions & trade-offs
- **All three decisions as recommended:** the previous colour worked out when read; the locked switch with its reason; "· edited" only when something changed, without a date.
- **Notice off reuses the intern's lift transition** (On notice → Active) with its own reason, rather than a new `withdrawNotice`. The plan named one, but it would only repeat the lift. The status event can't link the feedback, because the database allows a feedback link only on a notice event; the reason names the month instead.
- **The intern's colour is recalculated** after every edit from the newest coloured feedback, rather than worked out from what changed. It's one indexed query, and it can't drift.
- **Not in v2:** the Edit button, the edit dialog's wording, the switch's lock wording, and "· edited" on feedback.
- **"No colour" keeps its 9.5 description** ("Feedback only. Keeps the current code.") in edit mode. The help line under the colours explains the edit case.

## Deviations from plan
- Two migrations instead of one `0007` (see above).
- No separate `can-edit-feedback.ts`. The rule is `isEditableBy` in `feedback-entry.ts`, with the page's existing `canFeedback`.

## Not done / follow-ups
- **Delivery (10.2):** once conversations deliver feedback, Edit disappears from delivered cards, as the API already requires.
