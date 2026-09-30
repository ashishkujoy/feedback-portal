# 0.4 Contracts package — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/package.json` | `@feedback-portal/contracts`, ESM, `exports: { ".": "./src/index.ts" }` (source, no build). Scripts `test` (`vitest run`), `typecheck` (`tsc -p .`). Deps: `zod@4.6.5`. devDeps: `vitest@5.0.2`, `@feedback-portal/tsconfig`. All pinned exactly. |
| `packages/contracts/tsconfig.json` | Extends `node.json`, includes `src` |
| `src/role.ts`, `batch-member-role.ts`, `feedback-state.ts` | Zod enums, each with a type of the same name |
| `src/color-code.ts` | `ColorCode`, frozen `colorCodeSeverity` (1–6), `compareColorCodes` (null sorts before green) |
| `src/intern-status.ts` | `InternStatus`, `finalInternStatuses` (a `ReadonlySet`), `isFinalStatus` |
| `src/index.ts` | Barrel file re-exporting everything above |
| `src/*.test.ts` | 3 files, 39 tests |
| Root `package.json` | `test` = `pnpm -r --if-present test`. `check` now also runs `test`. |

## How to verify
```sh
pnpm check                              # format → lint (type-aware) → typecheck → test; exit 0
pnpm --filter @feedback-portal/contracts test   # 39 passed
```
Smoke test (a temporary `packages/zz-import-smoke`, since deleted, with no trace left in the lockfile): plain `node main.ts` imported `@feedback-portal/contracts` through the workspace symlink and printed `[null,"green","red"] true false`. **Native TS across packages works with no build step.**

## Tests
| Test file | Covers |
|---|---|
| `enums.test.ts` | For all 5 enums: `.options` matches the data model exactly, every value is accepted, and `'unknown'`/`undefined` are rejected |
| `color-code.test.ts` | Severity is 1–6 in data-model order; the map is frozen; a shuffled list including `null` sorts correctly; equal codes compare as 0 |
| `intern-status.test.ts` | `isFinalStatus` for every status |

## Decisions & trade-offs
- **`vitest@5.0.2`, not 5.0.3.** pnpm 12's supply-chain rule (`minimumReleaseAge`, 1 day) blocks versions published within the last day. 5.0.3 was only about an hour old. Installing it by exact version made pnpm **add exceptions to `pnpm-workspace.yaml` without asking**, which silently weakens the protection. I undid that, restored the committed lockfile, and pinned 5.0.2 (published 5 days earlier). There are no exceptions left. Rule for future installs: **never accept `minimumReleaseAgeExclude` entries.** Pick the newest version that's old enough instead.
- **A test file for all enums** (`enums.test.ts`) instead of a file per enum. The checks are the same for each, so `describe.each` avoids five copies.
- `finalInternStatuses` is a `ReadonlySet`, and `colorCodeSeverity` is frozen, so shared constants can't be changed at runtime.
- Doc comments only where the reason isn't obvious (severity direction, why `null` sorts first, what "final" means).

## Deviations from plan
- Tests: the plan listed `color-code.test.ts` and `intern-status.test.ts`. I added `enums.test.ts` for the "every enum" checks. Coverage is the same as planned.
- Vitest version: 5.0.2 instead of 5.0.3 (see above).
