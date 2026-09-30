# 1.1 Hono app — Plan

**Phase:** 1 — Backend skeleton
**Status:** Done

## Goal
Create `apps/api`: a Hono app built by a factory (`createApp`) so tests can call it without opening a port, a separate entry point that starts the HTTP server, and `GET /health`.

## Done when
- A Vitest test calls `GET /health` through `app.request()` (no port) and passes.
- `pnpm --filter @feedback-portal/api dev` starts the server, and `curl localhost:3000/health` returns `200 {"status":"ok"}`.
- `pnpm check` passes.

## Plan

### Versions (newest that are at least 1 day old)
| Package | Version | Note |
|---|---|---|
| `hono` | 4.13.11 | 4.13.12 was published today, so the release-age rule blocks it |
| `@hono/node-server` | 2.1.3 | |
| `vitest` | 5.0.2 | Same as contracts |

### Layout
The DDD layout from TECH_STACK. Only what this task needs is created:
```
apps/api/
  package.json          # @feedback-portal/api; scripts: dev, start, test, typecheck
  tsconfig.json         # extends @feedback-portal/tsconfig/node.json
  src/
    main.ts             # composition root: createApp() → serve(); graceful shutdown
    app.ts              # createApp(): Hono — mounts routes; no I/O, no listen
    shared/http/
      health.routes.ts  # GET /health
    app.test.ts         # health test via app.request()
```

### Behaviour
- **`GET /health`** returns `200` with `{ "status": "ok" }`.
  - This is a **liveness** check: it only says the process is up. A readiness check that also pings the database comes with Postgres (1.5).
  - It is mounted at the **root**, not under `/api`, so Docker and load-balancer probes don't depend on the API prefix. Feature routes will live under `/api/*` (decided when the first one arrives in 3.7).
- **Response schema in contracts:** `HealthResponse = z.object({ status: z.literal('ok') })` goes in `@feedback-portal/contracts`. The test parses the response with it. This sets the pattern that every endpoint's response has a shared schema.
- **`main.ts`:**
  - Starts `@hono/node-server` on port `3000`, hard-coded for now. `PORT` comes from validated config in 1.2.
  - **Graceful shutdown:** on `SIGINT` or `SIGTERM`, stop accepting connections, let in-flight requests finish, then exit. Docker needs this.
  - The startup message goes through `process.stdout.write`. It moves to the LogTape logger in 1.3, and `no-console` stays enforced.

### Scripts (`apps/api`)
| Script | Command |
|---|---|
| `dev` | `node --watch src/main.ts` (Node's built-in watch mode, no nodemon) |
| `start` | `node src/main.ts` |
| `test` | `vitest run` |
| `typecheck` | `tsc -p .` |

### Tests
- `GET /health` returns 200, `content-type` is JSON, and the body passes `HealthResponse.parse`.
- `GET /does-not-exist` returns 404. Hono's default handles it; a JSON error shape comes in 1.4.

### Out of scope
- Config and env (1.2), logging (1.3), error handling and the problem-JSON shape (1.4), DB readiness (1.5).
- CORS and security headers. The web app uses a Vite proxy on the same origin (4.3). Headers are decided with auth (3.x).
- Hono RPC client (`hc`). The frontend uses a typed fetch wrapper with contracts (4.3).

### Steps
1. Add `HealthResponse` to contracts, with a test.
2. Create `apps/api` (package, tsconfig) and install deps. **Check `pnpm-workspace.yaml` for release-age exceptions.**
3. Write `app.ts`, `health.routes.ts`, and `main.ts`.
4. Write `app.test.ts`.
5. Manual run: `dev`, then `curl /health`, then Ctrl-C and confirm a clean shutdown.
6. `pnpm check`. Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- The manual `curl` returns the expected body, and the process exits cleanly on `SIGINT` (exit code 0).
