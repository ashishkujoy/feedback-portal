# 1.3 Logging — Plan

**Phase:** 1 — Backend skeleton
**Status:** Done

## Goal
LogTape JSON logs to stdout, plus request-logging middleware

## Done when
- Each request logs method, path, status, and duration as one structured record.
- Every record written while a request is handled carries a `requestId`, and the response returns it in `x-request-id`.
- `main.ts` logs through LogTape. The `process.stdout.write` calls are gone, except the config-error path (see below).
- `pnpm check` passes.

## Plan

### Packages (exact pins, all published 2026-09-29, more than 1 day old)
| Package | Version | Deps |
|---|---|---|
| `@logtape/logtape` | 2.3.10 | none |
| `@logtape/hono` | 2.3.10 | peers only: `hono`, `@logtape/logtape` |

Using `@logtape/hono` is optional; we could write about 20 lines of middleware ourselves. I chose the package because:
- It's tiny, adds no transitive deps, and is maintained in the same repo as LogTape.
- It already handles request-ID extraction, generation and the response header.
- It sets up the request-scoped implicit context.

### Config additions (`config.ts`)
| Env var | Values | Default | Maps to |
|---|---|---|---|
| `LOG_LEVEL` | `trace` \| `debug` \| `info` \| `warning` \| `error` \| `fatal` | `info` | `log.level` |
| `LOG_FORMAT` | `json` \| `pretty` | `json` | `log.format` |

- The default is `json`, because that's what Docker, production and the later OTel/Loki pipeline need.
- `.env.example` sets `LOG_FORMAT=pretty` for local dev. That uses LogTape's built-in `ansiColorFormatter`, so no extra package is needed.

### Files
```
apps/api/src/shared/logging/
  logging.ts            # configureLogging(log config, sink?) / getLogger re-export helper
  logging.test.ts
apps/api/src/shared/http/
  request-logger.ts     # requestLogger(): honoLogger(...) with our options
  request-logger.test.ts
apps/api/src/app.ts     # app.use('*', requestLogger()) before routes
apps/api/src/main.ts    # configureLogging → logger for startup/shutdown; dispose() before exit
```

### Logging setup (`configureLogging`)
- **Sink:** `getStreamSink` on stdout, so we don't go through `console.*`. The sink is a parameter, which lets tests pass an in-memory array sink.
- **Formatter:**
  - `json` uses `jsonLinesFormatter`, which writes one JSON object per line: `@timestamp`, `level`, `message`, `logger` (the category), and the record properties.
  - `pretty` uses `ansiColorFormatter`.
- **Logger categories:**
  - Root category `["api"]`, at the configured level. Modules use sub-categories such as `["api", "http"]` or `["api", "feedback"]`, as TECH_STACK specifies.
  - `["logtape", "meta"]` is set to `warning`, which hides LogTape's own startup notice but still shows its errors.
- **Context:** `contextLocalStorage: new AsyncLocalStorage()`. This is what makes the request ID appear on records logged deep in a handler, without passing a logger around.

### Request logger (`request-logger.ts`)
- **Category:** `["api", "http"]`, level `info`, logged **after** the response.
- **Custom format:** `{ method, path, status, durationMs }`, with the message `"{method} {path} {status} {durationMs}ms"`.
  - `path` has **no query string**, because query strings can hold tokens (the OAuth `code` and `state` arrive in 3.x).
  - The user agent and referrer are left out to keep records small. They can be added later if we need them.
- **Request ID:**
  - The middleware reuses an incoming `x-request-id` only if it matches `^[A-Za-z0-9._-]{1,128}$`. Otherwise it generates `crypto.randomUUID()`.
  - The regex prevents log injection and oversized values.
  - The ID is echoed back in the `x-request-id` response header.
- **`/health` is skipped.** Docker healthchecks call it every few seconds, and logging each one would flood the logs.
  - **This is an exception to "each request logs".** Tell me if you'd rather log it at `debug` instead. That needs a small wrapper, because the package uses a single level.

### `main.ts`
- **Config errors still go to stderr as plain text.** Logging can't be configured until config has loaded, and the LOG_* settings come from that config.
- After config loads: `await configureLogging(config.log)`, then `getLogger(['api'])` for:
  - listening (`info`, with host, port and env)
  - the shutdown signal (`info`)
  - forced exit (`error`)
- **On shutdown:** `await dispose()` before `process.exit`, so buffered records are flushed.

### Tests
- **`logging.test.ts`:**
  - The `json` formatter writes one valid JSON line with `level`, `logger` and `message`.
  - The configured level filters out lower levels (`warning` drops `info`).
  - Config: `LOG_LEVEL` and `LOG_FORMAT` have the right defaults, and invalid values are rejected. These go in the existing `config.test.ts`.
- **`request-logger.test.ts`**, using `app.request()` with an array sink and `reset()` after each test:
  - `GET /health?x=1` writes no record (skipped).
  - A request to an unknown path writes one record `{ method: 'GET', path, status: 404, durationMs: number }`. The query string is absent and `requestId` is present.
  - A valid incoming `x-request-id` is reused and echoed. An invalid one (spaces or newlines, more than 128 characters) is replaced by a UUID.
  - A record logged inside a handler during the request carries the same `requestId`. This is tested with a throwaway route on a test app, using the same middleware.

### Out of scope
- **OTel log export and trace/span IDs** on records: `@logtape/otel` comes in 2.2, with LGTM.
- **Error logging and the problem-JSON shape:** 1.4. Unhandled errors log at `error` there.
- **Redaction (`@logtape/redaction`):** not needed yet, because no secrets or PII are logged. Revisit with auth (3.x).
- **Web app logging.**

### Steps
1. Install the packages. Check `pnpm-workspace.yaml` for release-age exceptions.
2. Add `LOG_LEVEL`/`LOG_FORMAT` to config, with tests. Update `.env.example`.
3. Write `logging.ts` and `request-logger.ts`, with tests.
4. Wire `app.ts` and `main.ts`.
5. Manual checks:
   - `pnpm dev`: pretty output.
   - `LOG_FORMAT=json`: JSON lines.
   - `curl -H 'x-request-id: abc' /nope`: ID echoed and logged.
   - `/health`: silent.
   - `SIGTERM`: clean exit.
6. `pnpm check`. Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- The manual run shows one JSON line per request with method, path, status, `durationMs` and `requestId`.
