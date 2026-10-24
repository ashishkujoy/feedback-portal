# 9.1 Schema — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/src/feedback-state.ts`, `index.ts` | **`feedbackStates`**, the tuple behind the existing `FeedbackState`, for the Postgres enum (as `internStatuses` and `colorCodes`). |
| `apps/api/src/modules/feedback/infrastructure/schema.ts` | **The new `feedback` module** (decision 3): `feedback_state` and **`feedback`**, with the DATA_MODEL columns.<br>**Indexes:** (`intern_id`, `period`); (`intern_id`, `submitted_at`) where coloured; (`author_id`, `state`).<br>**Checks:** `feedback_period_check` (the 1st of a month), `feedback_submitted_check` (`submitted_at` exactly when not a draft), `feedback_delivered_check` (`conversation_id` exactly when delivered), `feedback_previous_color_check` (no snapshot on a draft), `feedback_body_check` (non-blank once submitted).<br>`conversation_id` has no foreign key until `conversations` (10.1). No cascades. |
| `apps/api/drizzle/0005_feedback.sql` (+ meta) | Generated with `pnpm db:generate --name feedback`, plus **the hand-written `feedback_protect` trigger**: deleting anything but a draft is refused (decision 1), and **so is any update of a delivered row** (decision 2). Both raise `restrict_violation`, like the status history's trigger. |
| `apps/api/src/modules/intern/infrastructure/schema.ts` | **`intern_status_events.feedback_id` → `feedback`** (promised in 7.1), and **`intern_status_events_feedback_check`**: only an event going `on_notice` can point at feedback. |
| `apps/api/src/shared/db/columns.ts` | **`colorCodeEnum` moved here** from the intern schema. The intern and feedback schemas now import each other, and the enum is used at load time, so a shared home keeps the cycle safe. The Postgres type is unchanged, so the migration doesn't touch it. |
| `DATA_MODEL.md` | The table as built (the checks, the third index, the trigger), `conversation_id`'s foreign key in 10.1, the events check, the lifecycle (drafts can be discarded; delivered refuses any change), and §6.5 reworded: **"Submitted feedback is never deleted."** |

## How to verify
```sh
pnpm check     # contracts 72 + web 261 + api 573
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 72 + 261 + 573 (+12). Format and lint clean, with no suppressions. |
| Schema tests (12, Testcontainers, `feedback/infrastructure/schema.int.test.ts`) | **Defaults:** uuid v7, `draft`, no notice, no colours, no conversation or submission time, both timestamps. **Each check** passes its valid case and names itself when refused: a period on the 2nd; a draft with `submitted_at` and a submitted one without; delivered without a conversation and a conversation on submitted feedback; a draft with `previous_color_code` (a submitted one with or without it is fine); a blank or whitespace-only submitted body (a blank draft is fine). **Unknown** intern or author → foreign key; unknown state or colour → invalid value. **Deleting:** the draft goes; **submitted and delivered are refused** and stay. **Delivered:** submitted feedback is edited, then delivered; **changing its body, colour, state (back to submitted) or notice is each refused**, and the row is unchanged. An intern or a user with feedback can't be deleted. **Status events:** a notice points at its feedback; a missing feedback id is refused; a `withdrawn` event with `feedback_id` is refused by the new check. |
| Intern schema tests (11) | Still pass with the foreign key in place. |
| **Mutations** (on a copy of the migration, restored with `cp`, checked with `cmp`) | **4, all caught:** the period check removed; the `submitted_at` check removed; the trigger letting submitted feedback be deleted; the trigger letting delivered feedback be updated. |
| **Compose database** | `docker compose up --build`: migrate exited 0; `feedback` exists (empty), with `feedback_protect`, the events foreign key and check. Your account is the only user, as before. |
| Browser | **None:** nothing is visible until 9.5. |

## Decisions & trade-offs
- **All three decisions as agreed:** drafts can be discarded and nothing else can be deleted; delivered feedback can't change, enforced by the database; a new `feedback` module.
- **The trigger refuses every update of a delivered row,** including ones that change nothing. Nothing needs to update it; any future need (for example a redaction) would mean changing the trigger on purpose.
- **"An intern can't go back to no colour code", notice only for an active intern, and who may write** need the intern's state and the batch's members, so they're 9.2's domain rules, not checks.

## Deviations from plan
- **`colorCodeEnum` moved to `shared/db/columns.ts`** (not in the plan), to keep the two schemas' import cycle safe.
- **`feedback-state.ts` already existed** (with `FeedbackState`); it gained `feedbackStates` rather than being created.

## Not done / follow-ups
- **9.2:** the feedback domain, with readable errors for the rules the trigger enforces.
- **10.1:** `conversation_id`'s foreign key.
