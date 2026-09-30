# 0.4 Contracts package — Plan

**Phase:** 0 — Foundation
**Status:** Done

## Goal
Create `packages/contracts`, the single source of truth for shared Zod schemas and types. It starts with the domain enums used by both the API and the web app.

## Done when
- `@feedback-portal/contracts` exports `Role`, `BatchMemberRole`, `ColorCode` (with severity order), `InternStatus`, and `FeedbackState`.
- Vitest is set up, and the unit tests pass.
- `pnpm check` passes on the whole repo. This is the first time, since 0.3 needed at least one file to lint.
- Another workspace package can import it under plain Node (native TS) with no build step.

## Plan

### Versions (latest right now)
`zod@4.6.5`, `vitest@5.0.3`

### Package shape
- **No build step:** `exports` points at the source (`"." : "./src/index.ts"`). Node 24 strips the types natively. Vite and Vitest handle TS themselves.
- **Same name for schema and type:** `export const ColorCode = z.enum([...])` together with `export type ColorCode = z.infer<typeof ColorCode>`. Callers write `ColorCode.parse(x)` and `const c: ColorCode`.
- **One file per concept**, re-exported from `src/index.ts`. Tests sit next to the source as `*.test.ts`.

```
packages/contracts/
  package.json        # name, type: module, exports, scripts: typecheck, test
  tsconfig.json       # extends @feedback-portal/tsconfig/node.json, include src
  src/
    index.ts
    role.ts                 # Role: admin | mentor | program_manager
    batch-member-role.ts    # BatchMemberRole: mentor | program_manager
    color-code.ts           # ColorCode + severity + compare helpers
    intern-status.ts        # InternStatus + isFinalStatus
    feedback-state.ts       # FeedbackState: draft | submitted | delivered
    color-code.test.ts
    intern-status.test.ts
```

### Contents
| Export | Details |
|---|---|
| `Role` | `z.enum(['admin', 'mentor', 'program_manager'])` |
| `BatchMemberRole` | `z.enum(['mentor', 'program_manager'])` |
| `ColorCode` | `z.enum(['green', 'yellow', 'nearly_yellow', 'orange', 'nearly_red', 'red'])` |
| `colorCodeSeverity` | `Readonly<Record<ColorCode, number>>`: green 1 … red 6 (per DATA_MODEL §2) |
| `compareColorCodes(a, b)` | Sort comparator by severity, least severe first. **"No code" (`null`) sorts before green**, because every intern starts there. |
| `InternStatus` | `z.enum(['active', 'on_notice', 'graduated', 'terminated', 'withdrawn'])` |
| `finalInternStatuses` / `isFinalStatus(s)` | `graduated`, `terminated`, `withdrawn` |
| `FeedbackState` | `z.enum(['draft', 'submitted', 'delivered'])` |

Status **transition rules** stay out of contracts. They're domain logic and belong in the API's intern domain (7.2). Contracts only describe data shapes.

### Tests
- Every enum: accepts each valid value, rejects an unknown value, and the list of values matches the data model exactly (snapshot of `.options`).
- `colorCodeSeverity` covers every code, and the values are unique and ordered 1–6.
- `compareColorCodes`: sorts a shuffled list, including `null`, into the expected order.
- `isFinalStatus`: true only for the three final statuses.

### Root changes
- Script `test` = `pnpm -r --if-present test`, and `check` also runs `test`.
- Vitest is a devDependency of the contracts package, not the root. Each package owns its own test runner, with no root Vitest config for now.

### Out of scope
- API DTOs (added with each feature), `ImportStatus` (added in 8.x), and color code labels and descriptions (UI, 9.5).
- Coverage reporting.
- Using `zod/mini` for a smaller web bundle. We can revisit in 4.x if bundle size matters.

### Steps
1. Create the package, `tsconfig.json`, and scripts, and install `zod` and `vitest`.
2. Write the enums and helpers.
3. Write the tests.
4. Root `test` script, and `check` updated.
5. Smoke test: a temporary workspace package imports `@feedback-portal/contracts` and runs with plain `node` (deleted afterwards).
6. `pnpm check` passes.
7. Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0 (format, lint with type-aware rules, typecheck, tests).
- Plain `node` can import the package from another workspace package.
