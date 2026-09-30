# 0.1 Git + monorepo skeleton — Plan

**Phase:** 0 — Foundation
**Status:** Done

## Goal
Turn the empty folder into a git repository with a pnpm workspace ready for `apps/*` and `packages/*`.

## Done when
- `git status` works on branch `main`.
- `pnpm install` succeeds at the root (there are no packages yet, so it installs nothing).
- The first commit contains the docs (`PRODUCT.md`, `TECH_STACK.md`, `DATA_MODEL.md`, `ROADMAP.md`, `workflow/`) and the skeleton files.

## Plan

### Scope
| File | Content |
|---|---|
| `.git/` | `git init -b main` |
| `package.json` | `"private": true`, `"name": "step-feedback-portal"`, `"type": "module"`, `"packageManager": "pnpm@12.5.1"`, `"engines": { "node": ">=24" }`. No scripts yet. |
| `pnpm-workspace.yaml` | `packages: ["apps/*", "packages/*"]` |
| `.nvmrc` | `24` |
| `.npmrc` | `engine-strict=true`, so installing on the wrong Node version fails |
| `.editorconfig` | UTF-8, LF, 2-space indent, final newline |
| `.gitignore` | `node_modules`, `dist`, `coverage`, `.env*` (except `.env.example`), `*.log`, `.DS_Store`, `.vite`, `playwright-report`, `test-results` |
| `apps/.gitkeep`, `packages/.gitkeep` | Keeps the empty folders in git |
| `README.md` | Short intro, prerequisites (Node 24, pnpm, Docker), and links to the docs and `workflow/` |

Versions come from the local machine: Node `v24.21.0`, pnpm `12.5.1`.

### Out of scope
- TypeScript config (0.2), lint/format (0.3), and any packages (0.4 onward).
- A git remote and pushing. You add the remote whenever you like.
- CI.

### Steps
1. `git init -b main`
2. Create the files listed above.
3. Run `pnpm install` to check the workspace and create `pnpm-lock.yaml`.
4. Commit: `chore: initialise pnpm monorepo skeleton`.

### Verification
- `pnpm install` exits with code 0.
- `git log --oneline` shows one commit.
- `git status` is clean.
