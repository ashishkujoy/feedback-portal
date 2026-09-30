# 0.2 Shared TS config — Plan

**Phase:** 0 — Foundation
**Status:** Done

## Goal
Create `packages/tsconfig`, a set of strict, shared TypeScript configs that every app and package extends. Compiler settings then live in one place.

## Done when
- `@feedback-portal/tsconfig` exists with `base.json`, `node.json`, and `react.json`.
- TypeScript is installed at the root, and `pnpm typecheck` runs across the workspace.
- A throwaway sample project for each config type-checks. Deliberately bad code fails.

## Plan

### Key decision: run TypeScript natively on Node 24, with no build step in dev
Node 24 can run `.ts` files directly by stripping type annotations. That means `tsx`, `ts-node`, and a build step are not needed for the API in dev or tests, which matches the goal of **lightweight dependencies**. To be compatible, the configs enforce:
- `erasableSyntaxOnly`: no `enum`, `namespace`, or parameter properties. This suits us, because enums come from Zod anyway.
- `verbatimModuleSyntax`: type-only imports must use `import type`.
- Relative imports use the `.ts` extension (`import { x } from './x.ts'`). `rewriteRelativeImportExtensions` then lets `tsc` still emit a JS build if we ever need one.

If this runs into trouble later (for example, with path aliases), the fallback is to add `tsx`, a single dev dependency.

### Scope
| File | Content |
|---|---|
| `packages/tsconfig/package.json` | `name: "@feedback-portal/tsconfig"`, private, `files`/`exports` for the three JSON configs |
| `base.json` | `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `isolatedModules`, `moduleDetection: force`, `resolveJsonModule`, `skipLibCheck`, `target: ES2024`, `noEmit: true` |
| `node.json` | Extends base. `module`/`moduleResolution: nodenext`, `lib: [ES2024]`, `types: [node]`, `allowImportingTsExtensions`, `rewriteRelativeImportExtensions`. For `apps/api` and `packages/contracts`. |
| `react.json` | Extends base. `module: esnext`, `moduleResolution: bundler`, `jsx: react-jsx`, `lib: [ES2024, DOM, DOM.Iterable]`, `types: [vite/client]`. For `apps/web`. |
| Root `package.json` | devDeps: `typescript`, `@types/node`, `@feedback-portal/tsconfig` (`workspace:*`). Script `typecheck`: `pnpm -r --if-present typecheck`. |
| `tsconfig.json` (root) | Extends `node.json`. Covers root-level scripts and config files only (for now, none). |

`packages/.gitkeep` is removed, because `packages/` is no longer empty.

### Out of scope
- TS project references and composite builds. Each package runs `tsc --noEmit` on its own, which is simpler. We can revisit if typecheck gets slow.
- `vite/client` types are only referenced; they resolve once `apps/web` exists (4.1).
- Lint and format (0.3).

### Steps
1. Create `packages/tsconfig` with the three configs.
2. Add `typescript` and `@types/node` to the root, plus the `typecheck` script.
3. Verify with throwaway sample projects in the scratchpad (not committed):
   - A node sample: `.ts` imports with a `.ts` extension, `import type`, and run with `node sample.ts`.
   - Should fail: an `enum`, an unchecked index access, and a missing `.ts` extension.
4. Write `REVIEW.md`.

### Verification
- `pnpm install` and `pnpm typecheck` exit 0.
- The node sample runs with plain `node` and type-checks cleanly.
- The bad samples produce the expected `tsc` errors.

### Decisions
- `exactOptionalPropertyTypes` stays **on** for now. Switch it off per package only if a library conflicts with it.
- Naming is neutral: packages use the `@feedback-portal/*` scope, and the root package is `feedback-portal`. No program or org name appears in code or file names (see 0.1 findings).
