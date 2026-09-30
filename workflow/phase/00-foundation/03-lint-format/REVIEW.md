# 0.3 Lint + format — Review

## What changed
| File | Notes |
|---|---|
| `package.json` | devDeps pinned exactly: `oxlint@1.86.0`, `oxfmt@0.71.0`, `oxlint-tsgolint@7.0.2003`. Scripts: `lint` (`--type-aware --deny-warnings`), `lint:fix`, `format`, `format:check`, `check` (format check → lint → typecheck). |
| `.oxlintrc.json` | Plugins: typescript, unicorn, oxc, import, promise, node, vitest. Categories: correctness and suspicious = error, perf = warn. Rules listed below. `import/no-default-export` is turned off for `*.config.*`. Ignores `dist`, `coverage`, and `drizzle`. |
| `.oxfmtrc.json` | 100 columns, 2 spaces, single quotes, semicolons, trailing commas, arrow parens always, LF, final newline. Ignores the lockfile, `dist`, `coverage`, and `*.md`. |
| `packages/tsconfig/base.json` | Added `noImplicitReturns: true` (see Deviations) |
| `package.json`, `pnpm-workspace.yaml` | Reformatted by the first `pnpm format`: package.json keys sorted into the standard order, YAML switched to single quotes |

### Rules beyond the categories
| Rule | Purpose |
|---|---|
| `eslint/func-style: expression` | Arrow functions only, no `function` declarations |
| `eslint/prefer-arrow-callback` | Arrow callbacks |
| `eslint/eqeqeq` | `===` only |
| `eslint/no-console` (warn → fails because of `--deny-warnings`) | Use the logger |
| `import/no-default-export` | Named exports only |
| `typescript/consistent-type-imports` | `import type` for types |
| `typescript/no-explicit-any` | Use `unknown` instead |
| **Type-aware:** `no-floating-promises`, `no-misused-promises`, `await-thenable`, `only-throw-error`, `switch-exhaustiveness-check` | Async safety, throwing only `Error`s, and exhaustive handling of unions (color codes, statuses) |

## How to verify
```sh
pnpm format:check   # passes
pnpm lint           # currently exits 1: "No files found to lint" (see Deviations)
```

Sample results (a temporary `packages/zz-lint-sample`, since deleted):

| Broken code | Caught by |
|---|---|
| `export function declared()` | `func-style` ✅ |
| `xs.forEach(function (x) {…})` | `prefer-arrow-callback` ✅ |
| `x == 2` | `eqeqeq` ✅ |
| `console.log` | `no-console` (warning, fails the run) ✅ |
| `v: any` | `no-explicit-any` ✅ |
| `export default run` | `no-default-export` ✅ |
| `import { Kind }` used only as a type | `consistent-type-imports` ✅ |
| `fetchIt();` without `await` | `no-floating-promises` (type-aware) ✅ |
| `switch` missing a union member | `switch-exhaustiveness-check` (type-aware) ✅ plus `tsc` TS2366 ✅ |
| `(a:number,b:number)=>{return a+b}` | `oxfmt --check` ✅ |

The fixed version of every case passes both lint and format.

## Decisions & trade-offs
- `--deny-warnings` in `lint`: warnings fail the run too, so there's no pile-up of ignored warnings. `lint:fix` doesn't use it.
- `oxfmt` also sorts `package.json` keys (on by default). I kept that, because it gives stable diffs.
- oxfmt can also sort imports and Tailwind classes (`sortImports`, `sortTailwindcss`). They're **not** enabled. We can turn them on in 4.1 if you want.

## Deviations from plan
1. **`typescript/consistent-return` turned off, and `noImplicitReturns` added to the base tsconfig.** The lint rule flagged an exhaustive `switch` that returns in every branch, a pattern we'll use a lot for color codes and statuses. TypeScript's `noImplicitReturns` does the same job and understands exhaustiveness. I verified that the exhaustive switch passes and a partial switch fails (TS2366 plus the lint rule). This touches the 0.2 config.
2. **`pnpm lint` and so `pnpm check` exit 1 for now**, because the repo has no JS/TS files yet ("No files found to lint"). I did **not** add `--no-error-on-unmatched-pattern`, because it would also hide a misconfigured ignore list later. Both pass once 0.4 adds the first package.
