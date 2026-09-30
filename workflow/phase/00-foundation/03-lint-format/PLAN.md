# 0.3 Lint + format — Plan

**Phase:** 0 — Foundation
**Status:** Done

## Goal
Lint and format the whole workspace from the root with **oxlint** and **oxfmt**, including a rule that enforces the arrow-function preference.

## Done when
- `pnpm lint`, `pnpm format`, and `pnpm format:check` work from the root.
- A sample that breaks the rules fails lint and format checks. The fixed version passes.
- The current repo passes both checks.

## Plan

### Versions (latest right now)
| Tool | Version | Notes |
|---|---|---|
| `oxlint` | 1.86.0 | Stable |
| `oxfmt` | 0.71.0 | **Pre-1.0**, so its output can change between minor versions. Pin the exact version. |
| `oxlint-tsgolint` | 7.0.2003 | Optional, for type-aware lint. It uses the TS 7 compiler we already have. See the open point. |

### Scope
| File | Content |
|---|---|
| `.oxlintrc.json` | Categories `correctness` = error, `suspicious` = error, `perf` = warn. Plugins: `typescript`, `unicorn`, `import`, `promise`, `node`, `vitest`. React plugins are added in 4.1. Ignores: `dist`, `coverage`, `node_modules`, generated Drizzle migrations. |
| Arrow-function rules | `func-style: ["error", "expression"]` (no `function foo() {}` declarations), `prefer-arrow-callback: error`. If oxlint doesn't support one of these, I'll report it in REVIEW rather than add a plugin. |
| Other rules | `no-console: warn` (use the logger), `typescript/consistent-type-imports: error`, `import/no-default-export: error` (named exports only; config files that need a default export get an override), `eqeqeq: error`, `typescript/no-explicit-any: error` |
| `.oxfmtrc.json` | `printWidth: 100`, `singleQuote: true`, `semi: true`, `trailingComma: "all"`, `arrowParens: "always"`, `endOfLine: "lf"`. Kept consistent with `.editorconfig`. |
| Format ignores | `pnpm-lock.yaml`, `dist`, `coverage`, and **`*.md`**, so the docs and workflow tables aren't reflowed |
| Root `package.json` scripts | `lint` = `oxlint`, `lint:fix` = `oxlint --fix`, `format` = `oxfmt`, `format:check` = `oxfmt --check`, `check` = `pnpm format:check && pnpm lint && pnpm typecheck` |

### Out of scope
- Git pre-commit hooks (for example, lefthook). Can be added later as a separate small task.
- CI.
- React-specific rules (4.1).

### Steps
1. `pnpm add -Dw -E oxlint oxfmt oxlint-tsgolint` (exact versions).
2. Add the two config files and the scripts.
3. Run `pnpm format` once on the existing JSON files and accept the result.
4. Verify with scratchpad samples: a `function` declaration, a non-arrow callback, `==`, `any`, a default export, and badly formatted code. Then check that the fixed version passes.
5. Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0 on the repo.
- Every broken sample fails with the expected rule. `oxfmt --check` flags the unformatted file.

### Decisions
1. **Type-aware linting: added now** (`oxlint-tsgolint` + `--type-aware`).
2. Format style approved: 100 columns, single quotes, semicolons, trailing commas.
3. Named exports only. Exceptions are for config files only.
