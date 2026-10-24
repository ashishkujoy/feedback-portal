# 9.5 Write feedback UI — Review

## What changed
| File | Notes |
|---|---|
| `apps/web/src/interns/give-feedback-dialog.tsx` | **v2 A7**, 560px: "Give feedback to \<name\>" and its description. **Feedback period** (native select) beside the **Notice** box with a Switch; v2's **seven-row colour list** (native radios, named by colour, described by their v2 sentence) and the help line; the 9.4 **editor**; **Cancel** (ghost) left, **Save draft** and **Submit feedback** right ("Saving…" / "Submitting…"). React Hook Form with the shared `FeedbackContentRequest`, plus "Write your feedback before submitting." on Submit only. **Submit** refreshes the profile, roster, batch and batches list (exact keys); both refresh the feedback list (for 9.6). A refusal shows the issue callout with the API's detail and keeps everything. A **`draft`** prop opens an existing draft and `PUT`s it. The fields scroll with the buttons in view. |
| `apps/web/src/interns/feedback-form.ts` (+ test) | The months (today's UTC month back to the batch's start, newest first, or the first month and `notStarted` for a batch that hasn't started), "October 2026" labels, v2's colour descriptions, the colour help line and the notice line (a month from today, as the API sets it). |
| `apps/web/src/pages/intern-page.tsx` | **Give feedback** (primary, `message-square`) after the status buttons and in the empty timeline, for the batch's PM and current mentors, not archived, not a read-only intern. |
| `apps/web/src/batches/can-write-feedback.ts` | Who writes feedback: the PM or a current mentor of a batch that isn't archived (admins aren't, unless they're one of those). |
| `apps/web/src/api/feedback.ts` | `feedbackQuery`, `createFeedback`, `updateDraft`. |
| `apps/web/src/ui/switch.tsx` | Kuat Switch (36×20, `--primary` on, `slate-300` off, 16px thumb) as a `button role="switch"`. |
| `apps/web/src/ui/markdown-editor.tsx` | Takes a `ref` to its textarea, so the form focuses it on an error. |
| `apps/web/src/batches/batch-dates.ts` | `utcToday()`. |
| `design/README.md` | "Give feedback (A7) as built in 9.5". |

## How to verify
```sh
pnpm check     # contracts 76 + web 306 + api 618
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 76 + 306 (+22) + 618. Format and lint clean, with no suppressions; no new dependencies. |
| Web tests (16 + 6) | **Who:** the PM and a current mentor get both buttons; an admin who's neither, an archived batch and a terminated intern get none. **The form:** the description; months Oct → Jul with October chosen; seven colours in v2's order with descriptions, No colour chosen; both help lines; the notice line. **Notice on → Red** and its line; **Orange then notice off → Orange stays**; already on notice → switch off with "until 8 Nov 2026". **Submit** posts `{ period, body, colorCode: 'red', givesNotice: true, submit: true }`, refetches the profile and batch once each, and closes. **Blank Submit:** the message, focus on the field, no request. **Save draft:** blank allowed, no `submit`, no profile refetch. **A 503:** the callout with the detail, text kept. **Not started:** the message, December only, both buttons off. **Cancel** sends nothing. **An existing draft** opens with its values and `PUT`s, never `POST`s. Units: months across a year, this month only, not started, UTC "today", the notice ending 28 Feb from 31 Jan. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:** the blank-text check removed (1 failing test); notice not choosing Red (2); the button shown to any admin (1); no refresh after Submit (1). |
| **Browser** (Compose, headless Chrome, test users only, then deleted) | **Admin not in the batch:** no button. **Mentor:** header and timeline. **PM:** Add photo · Withdraw · Graduate · **Give feedback**. **Dialog** 560px, months Oct–Jul, Switch 36×20 slate → primary, chosen row `ee-blue-50`, Notice box Ember-50/300 when on. **Blank Submit:** focus in the textarea, `aria-invalid`, the message. **Keyboard:** Space toggles the switch (Red chosen, "Ends 24 Nov 2026. Rajesh Menon then lifts it or terminates…"); ↑/↓ move between Borderline Red and Red. **9.4's undo:** Ctrl+B → `**PAY-214**`, then ⌘Z and Ctrl+Z → back to plain. **Server error** (a 504 injected over CDP): the callout with "Server: 504 gateway timeout.", text and notice kept, fields scrolled to the top. **Submit:** closes; the profile shows **On notice**, the banner "On notice until 24 Nov 2026 · 31 days left", **Red**, and Terminate / Lift notice. **Again:** the switch off, "Kavya is already on notice until 24 Nov 2026.", "Current code: Red…". **Mentor's blank draft** saved (`draft`, October, their name). **At 700px high** only the fields scroll; Submit stays visible. |

## Decisions & trade-offs
- **All four decisions as recommended.**
- **The fields' scroll allowance is 240px, not v2's 220px.** With 220px the dialog scrolled by about 10px as well, because of the two-line description. 240px leaves one scrollbar.
- **"No colour yet. Set by the first coloured feedback."** for an intern without a code, rather than the plan's "No colour code yet." These are the side panel's words, so the two places agree.
- **A batch that hasn't started turns off Save draft too,** not only Submit as the plan said: the API refuses its month for drafts as well.
- **Until 9.6, a saved or submitted entry doesn't appear on the timeline,** which still says "No feedback yet" (with the button). The colour, notice and status do update.

## Deviations from plan
- **The scroll allowance, the empty colour line and Save draft for a batch that hasn't started,** as above.
- **7.5's test** that Give feedback is absent was removed; the new tests cover who sees it.

## Not done / follow-ups
- **9.6:** the timeline list, "Continue editing" (this dialog's `draft`) and "Discard".
- **Roster cards and rows** get Give feedback with the feedback counts (decision 1).
