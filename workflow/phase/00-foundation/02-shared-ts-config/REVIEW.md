# 0.2 Shared TS config — Review

## What changed
| File | Notes |
|---|---|
| `packages/tsconfig/package.json` | `@feedback-portal/tsconfig`, private, exports the three configs |
| `packages/tsconfig/base.json` | Strict base: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `isolatedModules`, `moduleDetection: force`, `resolveJsonModule`, `skipLibCheck`, `target: ES2024`, `noEmit` |
| `packages/tsconfig/node.json` | `nodenext`, `lib: ES2024`, `types: node`, `allowImportingTsExtensions`, `rewriteRelativeImportExtensions` |
| `packages/tsconfig/react.json` | `bundler` resolution, `jsx: react-jsx`, DOM libs, `types: vite/client`, `allowImportingTsExtensions` |
| `package.json` (root) | devDeps `typescript@^7.0.2`, `@types/node@^24.19.0`, `@feedback-portal/tsconfig@workspace:*`. Script `typecheck` = `pnpm -r --if-present typecheck` |
| `packages/.gitkeep` | Removed |

**Naming fix (0.1 finding F1), shipped with this task:**
- Root package renamed to `feedback-portal`.
- Doc titles made neutral.
- `PROGRAM_NAME`/`ORG_NAME` are now required config with no defaults (`TECH_STACK.md` §6).
- `app_settings` table removed (`DATA_MODEL.md`).
- Roadmap 4.5 updated to read branding from config.

## How to verify
```sh
pnpm install && pnpm typecheck      # exit 0 (no packages define typecheck yet)
```
Sample projects (in the session scratchpad, not committed), each extending `@feedback-portal/tsconfig/node.json`:

| Sample | Result |
|---|---|
| good: `.ts` imports, `import type`, optional prop, index access with `?.` | `tsc` exit 0. **`node main.ts` runs natively** and prints `Ada A function` |
| bad: missing `.ts` extension | TS2835 ✅ |
| bad: value import of a type | TS1484 (`verbatimModuleSyntax`) ✅ |
| bad: `enum` | TS1294 (`erasableSyntaxOnly`) ✅ |
| bad: `xs[5]` assigned to `number` | TS2322 (`noUncheckedIndexedAccess`) ✅ |
| bad: `{ a: undefined }` for `a?: string` | TS2375 (`exactOptionalPropertyTypes`) ✅ |
| bad: `env.FOO` on a `Record` | TS4111 (`noPropertyAccessFromIndexSignature`) ✅ |

## Decisions & trade-offs
- **TypeScript 7.0.2** (the Go-native compiler) was the latest version and installed cleanly. All the options we use are supported. If an editor or tool doesn't support TS 7 yet, pin `typescript@5` instead. The configs are the same for both.
- `@types/node` is pinned to `24.x` to match the runtime.
- `react.json` also sets `allowImportingTsExtensions`, so imports use the same style in every package. This is safe because Vite does the emitting.

## Deviations from plan
- **No root `tsconfig.json` yet.** With no root `.ts` files, `tsc` fails with TS18003 ("no inputs"). It will be added once a root script or config file exists.
- **`react.json` hasn't been type-checked against a sample yet.** That needs `vite/client` and `@types/react`, which arrive in 4.1. It will be verified there.
