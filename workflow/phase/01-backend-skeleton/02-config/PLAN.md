# 1.2 Config — Plan

**Phase:** 1 — Backend skeleton
**Status:** Done

## Goal
Load the API's configuration from environment variables once at startup, validate it with Zod, and pass it on as a typed, read-only object. If the config is invalid, the app refuses to start.

## Done when
- `loadConfig(env)` returns a typed, frozen `Config`, or throws a `ConfigError` that lists **every** problem.
- `main.ts` uses it. With invalid config, the process prints the problems (never the values) and exits with code 1.
- `apps/api/.env.example` is committed, and `.env` is loaded natively in dev.
- `pnpm check` passes.

## Plan

### No `dotenv` dependency
Node 24 loads env files natively: `node --env-file-if-exists=.env …`. The `dev` and `start` scripts use this. In Docker and production, variables come from the real environment, and no file is needed.

### Variables in this task
Only what exists now. Later tasks add their own variables (DB in 1.5, OTel in 2.2, Google/session in 3.x, Cloudinary in 7.7, Airtable in 8.1).

| Env var | Type | Required | Default | Maps to |
|---|---|---|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` | no | `development` | `env` |
| `HOST` | string | no | `0.0.0.0` | `server.host` |
| `PORT` | integer 1–65535 | no | `3000` | `server.port` |
| `PROGRAM_NAME` | non-empty string | **yes** | — (no default, per 0.1 F1) | `branding.programName` |
| `ORG_NAME` | non-empty string | **yes** | — | `branding.orgName` |

- Values are trimmed. An **empty string counts as missing**, so `PROGRAM_NAME=` is an error.
- Unknown env vars are ignored, because the process environment is full of unrelated variables.

### Shape
```ts
type Config = Readonly<{
  env: 'development' | 'test' | 'production';
  server: Readonly<{ host: string; port: number }>;
  branding: Readonly<{ programName: string; orgName: string }>;
}>;
```
A flat env schema is parsed first, then mapped into this nested, frozen object. The rest of the code never reads `process.env` directly.

### Files
```
apps/api/
  .env.example                      # placeholders only, e.g. PROGRAM_NAME="Your Program"
  src/shared/config/
    config.ts                       # EnvSchema, Config type, loadConfig(env), ConfigError
    config.test.ts
  src/main.ts                       # loadConfig(process.env) → uses server.host/port
```
- The env schema lives in `apps/api`, **not** in contracts, because it's backend-only.
- `createApp()` stays without parameters for now. Config is passed in once a route needs it (branding in 4.5).

### Error output
```
Invalid configuration:
  - PROGRAM_NAME: required
  - PORT: expected an integer between 1 and 65535
```
Only variable names and messages are printed, **never values**, because future variables hold secrets. Exit code 1.

### Tests (`config.test.ts`)
- A valid env gives the expected nested config. Defaults are applied (`development`, `0.0.0.0`, `3000`).
- Missing `PROGRAM_NAME` and `ORG_NAME` are **both** reported in one error.
- Empty or whitespace-only `PROGRAM_NAME` is rejected.
- `PORT`: `'8080'` gives `8080`. `'abc'`, `'0'`, `'70000'`, and `'3.5'` are rejected.
- Invalid `NODE_ENV` is rejected.
- The error message doesn't contain the supplied values (checked with a sentinel value).
- The returned config is deeply frozen.
- Unknown env vars are ignored.

### Out of scope
- Secrets management (Docker secrets, a vault). That's for production (11.4).
- Web app config. Vite has its own env handling (4.x), and branding reaches the UI through `GET /settings` (4.5).

### Steps
1. `config.ts` + tests.
2. Wire `main.ts`. Update the `dev` and `start` scripts to `--env-file-if-exists=.env`.
3. Add `.env.example`. Create a local `.env` from it; it's git-ignored and not committed.
4. Manual checks: start with a valid `.env`, then start without `PROGRAM_NAME` and confirm the error list and exit code 1.
5. `pnpm check`. Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- A missing required variable prints the list of problems and exits with code 1. A valid `.env` starts the server on the configured port.
