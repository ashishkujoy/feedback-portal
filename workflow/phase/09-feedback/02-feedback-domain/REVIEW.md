# 9.2 Feedback domain — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/feedback/domain/feedback.ts`, `feedback-id.ts` | **The pure `Feedback` aggregate.**<br>• **`draftFeedback`:** month, text (may be blank), colour (default none), notice; not for a read-only intern; notice only for an Active one.<br>• **`editDraft`:** the author replaces any of them.<br>• **`discardDraft`:** the author, still a draft; needs no intern, so a read-only one never blocks it.<br>• **`submitFeedback`** → `{ feedback, intern }`: the author, a draft, written ("Write your feedback before submitting."), a month in range, notice only for an Active intern. **Setting a colour** snapshots the intern's code and sets the new one; **no colour** leaves both alone (decision 5). **Notice** goes through the intern's `giveNotice`: one month from today, with "Notice given in the October 2026 feedback." and the feedback's id (decisions 2, 3). Any colour, or none, can go with notice (decision 1).<br>• **`editSubmitted`:** the text only, by the author.<br>• **`deliverFeedback`:** submitted → delivered, for 10.2.<br>• **Anything on delivered** → "Delivered feedback can't be changed." (`feedback_delivered`).<br>**Months** (decision 4): from the batch's start month to the current one ("Choose a month from July 2026 to October 2026."); a malformed one → "Choose the month this feedback covers." (v2 A7-errors). |
| `apps/api/src/modules/intern/domain/intern.ts` | **`setColorCode`** (refused once read-only), and **`ensureEditable`** exported for the feedback domain. |
| `apps/api/src/modules/feedback/application/feedback-repository.ts`, `infrastructure/drizzle-feedback-repository.ts` | **`findById`**; **`save(feedback, intern?)`** in one transaction (a savepoint inside a caller's), feedback first because a notice's event refers to it, the intern through the intern module's repository; **`deleteDraft`** (drafts only, as the trigger also insists). |
| `packages/contracts/src/problem.ts` (+ test) | Error codes **`intern_not_active`**, **`feedback_not_draft`**, **`feedback_delivered`**. |
| `DATA_MODEL.md` | `previous_color_code` only when a code is set; notice from the submission day, Active only, with any colour; the month range; the history's sentence. |

## How to verify
```sh
pnpm check     # contracts 72 + web 261 + api 601
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 72 + 261 + 601 (+28). Format and lint clean, with no suppressions or casts. |
| Unit (22, `feedback.test.ts`) | **Drafts:** the starting state; blank and colourless allowed; July and October 2026 accepted for a batch starting 6 Jul with today 24 Oct, **June and November refused** with the range sentence; malformed months refused; 20,000 characters accepted, 20,001 refused; a read-only intern refused; **notice for an intern on notice refused** (`intern_not_active`) while plain feedback is fine; the author edits everything; another mentor can't edit or discard; the author discards. **Submitting:** Yellow → Orange snapshots `yellow`; a first colour snapshots "no code"; **no colour leaves the intern untouched (the same object) and no snapshot**; **notice:** On notice until 24 Nov 2026, the event from Active with the sentence, today's start, the feedback id and the mentor; **notice with no colour, Green or Borderline Yellow** all work; notice refused when the intern went on notice after the draft; a blank body and an out-of-range month refused; another author, a second submit and a read-only intern refused. **After:** text-only edits by the author (blank refused, others forbidden); month, colour and notice fixed (`feedback_not_draft`); delivered once, then **edit, edit-as-draft, discard, deliver and submit all give "Delivered feedback can't be changed."**; a draft can't be delivered. `monthLabel` in English. |
| Intern domain (2 new) | `setColorCode` sets the code and keeps the status and history; refused for a terminated intern. |
| Repository (4, Testcontainers) | A draft round-trips exactly. **A submission with notice** saves the feedback, the intern's Red and On notice until 24 Nov, and the event pointing at the feedback. **A failure part-way** (the notice event's actor doesn't exist, so the last write fails with a foreign-key error): **the feedback is still the draft, the intern has no colour and is Active, and there's only the onboarding event.** `deleteDraft` removes a draft and leaves submitted feedback. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:** the snapshot skipped (1 test); notice allowed for an intern already on notice (2); a submitted entry editable as a draft (1); the feedback written outside the transaction (1). |
| Browser | **None:** nothing is visible until 9.5. |

## Decisions & trade-offs
- **All five decisions as agreed.**
- **Notice is checked when a draft is saved and again on submit,** so a mentor isn't told only at the end, and a notice given meanwhile by someone else still stops it.
- **"Today" and the batch's start come from the caller** (`MonthRange`); 9.3 decides which time zone "today" is in.
- **Who may write** (a current mentor or the PM; admins only if assigned) isn't here: the domain knows authors, not batch membership. 9.3 checks it before calling these.

## Deviations from plan
- **Delivering is `deliverFeedback`** (the plan said `deliver`), alongside the other `…Feedback` names.
- **No `forbidden` code of its own:** another person's draft is a plain `forbidden`, as elsewhere.

## Not done / follow-ups
- **9.3:** the API, access (who may write; drafts visible to their author only) and the time zone for "today".
- **10.2:** conversations call `deliverFeedback`.
