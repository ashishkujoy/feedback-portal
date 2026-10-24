# 7.2 Intern domain — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/intern/domain/intern.ts` | **The `Intern` aggregate**, pure, in the style of `User` and `Batch`. It holds the 7.1 columns plus **`statusEvents`** (the history, oldest first). **One internal `transition`** checks, in order: read-only; the state machine; the reason; and for notice, the start date. It appends the event and updates `status` and `noticeEndsOn` together. **The named operations** are thin wrappers: `giveNotice` (with `startsOn` and an optional `feedbackId`), `liftNotice`, `terminate`, `graduate` and `withdraw`. Also **`onboardIntern`** (Active, with the onboarding event: no previous status, no reason), **`updateDetails`** (rejected once final), and the reads **`isReadOnly`** and **`currentNotice`**. |
| Same file: the rules | **Allowed:** active → on notice, graduated or withdrawn; on notice → active (lift), terminated or withdrawn. **Everything else is `invalid_status_transition`,** and anything from a final status is **`intern_read_only`** (decisions 1–3). **Reasons** are trimmed, 1–20,000 characters, and required for every change. **Notice** runs one calendar month (decision: start + 1 month, clamped). **Details** (decision 5): the username has its `@` removed and is limited to `[A-Za-z0-9._-]` and 1–50 characters; the name is 1–200; the email is lower-cased; optional fields are trimmed, with blank becoming `null`; interview notes are up to 20,000 characters. |
| `domain/intern-id.ts`, `status-event-id.ts` | Branded uuids |
| `apps/api/src/shared/calendar-date.ts` (+ test) | `addMonths` on `YYYY-MM-DD` with clamping, for the notice end (the web has its own copy for the Create batch form) |
| `packages/contracts/src/problem.ts` (+ test) | Error codes `invalid_status_transition` and `intern_read_only` |

## How to verify
```sh
pnpm check     # contracts 59 + web 133 + api 455
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 59 + 133 + **455** (+44). `pnpm format:check` is clean. |
| **All 25 transitions** | Generated from a table **written in the test, independent of the code's**: **6 allowed** (each gives the right status, event, actor, time, `noticeEndsOn` and `updatedAt`) and **19 rejected** (`intern_read_only` from the 3 final statuses, `invalid_status_transition` otherwise, including active → terminated, on notice → graduated and on notice → on notice). The intern for each starting status is reached through allowed changes only. A test asserts the counts: 25 = 6 + 19. |
| Onboarding (3) | Active, with exactly one event (`from` null, reason null, the actor and time). Details normalised (`" @Ishita.Rao "` → `Ishita.Rao`, the email lower-cased, blank → `null`). Invalid details reported together (`username`, `name`, `email`, `phone`). |
| Reasons (4) | Empty, spaces, and newlines-and-tabs are each rejected on **all five** changes (`reason`: "A reason is required"); reasons are trimmed. |
| Notice (5) | The end is a month on, and the feedback id is kept (`currentNotice`); **31 Jan → 28 Feb, and 29 Feb in a leap year**; 30 Feb is rejected; **lift, terminate and withdraw clear it**; a new notice can follow a lifted one. |
| Read-only and history (5) | `updateDetails` is rejected once graduated, terminated or withdrawn, and works while active or on notice. **Events only accumulate:** earlier ones are the same objects, and keep their actor. |
| **Mutations** (on a copy, restored with `cp`) | **6, all caught:** allowing active → terminated; allowing on notice → graduated; not clearing `noticeEndsOn`; no reason check; `updateDetails` on a final intern; notice ending after 30 days instead of a calendar month. |

## Decisions & trade-offs
- **All five decisions taken as recommended:** no graduating while on notice; terminating only from On notice; no second notice; roles left to the API; and the detail rules.
- **The check order is read-only, then the state machine, then the reason:** someone trying to change a graduated intern is told it's read-only, not that a reason is missing.
- **A notice without feedback is allowed** (`feedbackId: null`). Phase 9 will always pass one; 7.6 or a data fix might not.
- **`colorCode` is carried but never changed here.** Submitted feedback sets it in Phase 9.

## Deviations from plan
- **The transition tests are two generated lists (allowed and rejected) rather than one loop with an if/else.** The linter forbids conditional `expect`, and two lists also make the 6/19 split explicit.

## Not done / follow-ups
- **7.3:** the repository (inserting only new events), and adding an intern manually (API and UI).
- **7.6:** the status-change API and UI, with "only the PM".
- **Worth recording in PRODUCT §10 when convenient:** "terminate only from On notice" and "lift notice before graduating" are rules now. They're consistent with §10, but more specific than it.
