# 1.2 Config — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/shared/config/config.ts` | `EnvSchema` (Zod), `Config` type, `loadConfig(env)`, `ConfigError` (with `issues`). Only known keys are read, trimmed, and blank values count as missing. Returns a deeply frozen, nested config. |
| `apps/api/src/shared/config/config.test.ts` | 15 tests |
| `apps/api/src/main.ts` | Loads config first. On a `ConfigError` it writes the issue list to stderr and exits 1; other errors are re-thrown. Binds `hostname`/`port` from config and logs the env on startup. |
| `apps/api/package.json` | `zod@4.6.5` (exact). `dev` and `start` now use `node --env-file-if-exists=.env` |
| `apps/api/.env.example` | Placeholders only (`"Your Program"`, `"Your Organisation"`). Committed. |
| `apps/api/.env` | Local copy of the example. **Git-ignored and not committed** (checked with `git check-ignore`). |

## How to verify
```sh
pnpm check                                          # exit 0 — 41 contracts + 17 api tests
cd apps/api && pnpm dev                             # uses .env
env -i PATH="$PATH" node src/main.ts                # prints missing vars, exit 1
```

Manual runs:

| Case | Result |
|---|---|
| Valid `.env`, with `PORT=3100` set in the shell | Listens on 3100 (the real env overrides `.env`, which is what Docker needs). `/health` returns 200. `SIGTERM` exits 0. |
| `.env` with quoted values | Node's parser strips the quotes, giving `"Your Program"` → `Your Program` |
| Nothing set | `PROGRAM_NAME: required`, `ORG_NAME: required`, exit 1 |
| `PORT=supersecret NODE_ENV=staging` | Both reported, and **neither value appears** in the output. Exit 1. |

## Tests
Defaults and overrides; trimming; both missing required vars reported together; blank or whitespace-only values count as missing; `PORT` rejects `abc`, `0`, `70000`, `3.5`, and `-1`; invalid `NODE_ENV`; a sentinel value never appears in the error message; deep freeze; unknown vars ignored.

## Decisions & trade-offs
- **Blank means missing for every key**, not only the required ones. `HOST=` falls back to the default instead of binding to an empty host.
- **Only known keys are read** (`EnvSchema.keyof().options`), so nothing else from `process.env` reaches Zod or the error output.
- **Custom error messages:** Zod's defaults can mention received types (for example, "received NaN"). Custom messages keep the output short and make sure no value is ever included.
- `ConfigError` is a class, the one exception to arrow-style code, so that `instanceof` works. `erasableSyntaxOnly` allows it because there are no parameter properties.

## Deviations from plan
- None.
- One fix during implementation: the type-aware lint rule `no-unsafe-type-assertion` (from the `suspicious` category) flagged an `as EnvKey[]` cast on `Object.keys`. I replaced it with Zod's typed `keyof().options`, so there are no casts left.
