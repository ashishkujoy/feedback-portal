# 1.3 Logging — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/package.json` | `@logtape/logtape@2.3.10` (exact, zero deps). No release-age exceptions added (checked `pnpm-workspace.yaml`). |
| `apps/api/src/shared/config/config.ts` (+ test) | `LOG_LEVEL` (default `info`) and `LOG_FORMAT` (`json` \| `pretty`, default `json`) → frozen `config.log` |
| `apps/api/src/shared/logging/logging.ts` (+ test) | `configureLogging(log, sink?)`: stdout stream sink (`jsonLinesFormatter` or `ansiColorFormatter`), root category `api`, `logtape.meta` at `warning`, `AsyncLocalStorage` for request context. Sink is injectable for tests. |
| `apps/api/src/shared/http/request-logger.ts` (+ test) | Middleware: resolves `requestId`, runs the request inside `withContext({ requestId })`, sets `x-request-id`, logs one `api.http` record. Skips `/health`. |
| `apps/api/src/app.ts` | `.use(requestLogger())` before routes |
| `apps/api/src/main.ts` | Logs startup/shutdown/timeout through LogTape; `dispose()` before every `process.exit`. Config errors stay on stderr as plain text. |
| `apps/api/.env.example` | `LOG_LEVEL=info`, `LOG_FORMAT=pretty` (local `.env` updated too; still git-ignored) |

## How to verify
```sh
pnpm check                                             # exit 0 — 41 contracts + 27 api tests
cd apps/api && pnpm dev                                # pretty output
LOG_FORMAT=json pnpm dev
curl -i -H 'x-request-id: abc' 'localhost:3000/nope?code=x'   # x-request-id: abc, logged, no query
```

Manual run (`PORT=3100`, then `SIGTERM`):

| Case | Result |
|---|---|
| `LOG_FORMAT=json` | One JSON line per record. Request: `{"level":"INFO","logger":"api.http","properties":{"requestId":"abc","method":"GET","path":"/nope","status":404,"durationMs":0.2}}`. Query string absent. |
| `x-request-id: bad id` | Replaced with a UUID, echoed in the response header and logged |
| `/health` | Not logged |
| `LOG_FORMAT=pretty` (default from `.env`) | Coloured single-line output |
| `LOG_LEVEL=warning` | Nothing written (all records are `info`) |
| `SIGTERM` | Shutdown logged, exit 0 |

## Tests
- Config: new defaults, overrides, invalid `LOG_LEVEL`/`LOG_FORMAT` both reported, `config.log` frozen.
- Logging: level filtering; loggers outside the `api` category ignored.
- Request logger: exact record properties for a 404 with a query (`secret-token` never appears); `/health` not logged but still gets `x-request-id`; safe incoming ID reused; unsafe IDs (space, quote, 129 chars) replaced with a UUID; a record logged inside a handler carries the same `requestId`.

## Decisions & trade-offs
- **`requestId` is also set explicitly on the request record.** The request record is logged after `withContext` ends, so it doesn't inherit the context.
- **Properties are nested** under `properties` (LogTape's JSON default) instead of flattened, so app fields can't collide with `level`/`message`/`logger`.
- **`durationMs` is rounded to 0.1 ms** (`performance.now()`), so fast requests don't all show `0`.
- **Message rendering quotes strings** (`"GET" "/nope" 404 0.2ms`). That's LogTape's default rendering of string values; the structured fields are unquoted. It's cosmetic, so I left it alone.
- **Logged after the handler returns**, not after the body finishes streaming. All our responses are JSON, so these are effectively the same time.
- `app.test.ts` doesn't configure logging. Unconfigured LogTape is a no-op, so the existing tests stay silent.

## Deviations from plan
- **Dropped `@logtape/hono`, wrote our own middleware (~30 lines) instead.**
  - With an object format, the package logs using a fixed message template (`{method} {url} {status} - {responseTime} ms`). That ignores our field names, so the message would print `undefined` for `url`/`responseTime`, unless we renamed our fields to match.
  - It also delays the log until the response body finishes streaming. That's more machinery than we need.
  - Our version is LogTape core's `withContext` plus the same safe-ID rule. Result: one dependency (`@logtape/logtape`) instead of two.
- The plan said "Awaiting approval" as a status, but the board's vocabulary has no such status. I used `Planning` → `In progress` → `In review`.
