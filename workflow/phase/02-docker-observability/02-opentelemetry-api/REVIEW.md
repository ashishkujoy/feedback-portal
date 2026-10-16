# 2.2 OpenTelemetry (api) — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/package.json` | **−** `postgres`. **+** `pg@8.23.1`, `@opentelemetry/{api@1.9.1, sdk-trace-node@2.12.0, sdk-metrics@2.12.0, resources@2.12.0, semantic-conventions@1.43.0, instrumentation@0.223.0, instrumentation-http@0.223.0, instrumentation-pg@0.75.0, exporter-trace-otlp-http@0.223.0, exporter-metrics-otlp-http@0.223.0}`, `import-in-the-middle@3.5.2`. Dev: `@types/pg@8.23.1`. All pinned exactly and more than 1 day old. `pnpm-workspace.yaml` is unchanged: no new build scripts and no release-age exceptions. The `dev` and `start` scripts gain `--import ./src/instrumentation.ts`. |
| `src/shared/db/client.ts` | postgres.js → `pg` `Pool` with Drizzle's `node-postgres` driver. Same `{ db, ping, close }` interface. Adds a pool `error` listener (see decisions). |
| `src/shared/db/migrate.ts` | Migrator import → `drizzle-orm/node-postgres/migrator` |
| `src/shared/config/config.ts` | `telemetry` section from `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `OTEL_SDK_DISABLED` and `OTEL_METRIC_EXPORT_INTERVAL`. The type is a union: `{ enabled: false }` or `{ enabled: true, endpoint, serviceName, metricExportIntervalMs }`. |
| `src/instrumentation.ts` | New preload entry. If telemetry is enabled, it registers the import-in-the-middle ESM hook (only for modules the instrumentations ask for), dynamically imports `telemetry.ts` and starts it. If disabled, it loads nothing. |
| `src/shared/telemetry/telemetry.ts` | `startTelemetry`: resource (`service.name`, `service.version`, `deployment.environment.name`), `NodeTracerProvider` + `BatchSpanProcessor` + OTLP/HTTP trace exporter, `MeterProvider` + periodic OTLP/HTTP metric exporter, HTTP and pg instrumentations, and OTel diagnostics routed to LogTape (`api.otel`, warning and above) |
| `src/shared/telemetry/handle.ts` | Module-level handle shared by the preload and `main.ts`: `setTelemetry`, `isTelemetryStarted`, `shutdownTelemetry` |
| `src/shared/http/trace-route.ts` | Middleware that renames the server span to `METHOD /route/:pattern`, sets `http.route` and adds `request.id`. Registered in `createBaseApp()`. |
| `src/main.ts` | Shutdown is now server → DB → **telemetry flush** → logs. Logs a warning if telemetry is configured but the preload wasn't used. |
| `apps/api/Dockerfile` | `CMD` gains `--import ./src/instrumentation.ts` |
| `apps/api/.env.example` | `OTEL_*` variables, commented out |
| `test/test-db.ts` | Moved to `pg` (`Client` for admin statements, `.rows` for results). `TestDb` gains `url`. |
| `src/shared/db/db.int.test.ts` | Reads `.rows` (node-postgres result shape) |
| `TECH_STACK.md` | New row: Postgres driver = pg, and why |

## How to verify
```sh
pnpm check                                                   # 45 contracts + 72 api tests
pnpm --filter @feedback-portal/api exec vitest run --project integration src/shared/telemetry
docker compose up -d --build --wait && curl localhost:3000/health/ready
```

| Check | Result |
|---|---|
| `pnpm check` | exit 0: 45 contracts tests; 72 api tests (64 unit + 8 integration) |
| Existing DB integration tests on `pg` | All pass, unchanged apart from `.rows` |
| **End-to-end test, telemetry on** | The real process (`node --import … src/main.ts`) exports to an OTLP/JSON receiver inside the test. **Server span `GET /health/ready`** has `http.route=/health/ready`, `request.id` = the `x-request-id` sent, and status 200. **`select 1` query span** has the same trace ID, and its parent chain reaches the server span. The `http.server.request.duration` metric is received. SIGTERM → exit 0, after flushing. |
| **End-to-end test, telemetry off** | The receiver gets **nothing**, the API serves, and it exits 0 |
| Manual run with a throwaway receiver | Spans: `pg-pool.connect` → `pg.connect` → `pg.query:SELECT feedback_portal` (with `db.query.text="select 1"` and no values), all children of `GET /health/ready`. `/nope` → span stays **`GET`** (no route, no raw path in the name). Metrics: `http.server.request.duration`, `db.client.operation.duration`, `db.client.connection.count`, `…pending_requests` and `…max`. |
| Docker image | Builds. `migrate` exits 0, `api` is healthy, `/health/ready` returns 200 (telemetry off, since Compose sets no endpoint until 2.3). `stop` → exit 0. 69 MB compressed, up from 65 MB. |

### Unit tests added
- **Config (5):** telemetry is off by default, on with an endpoint (with defaults), uses custom service name and interval, is forced off by `OTEL_SDK_DISABLED=true`, and rejects a bad endpoint, a bad flag or a too-small interval, reporting all three keys.
- **`trace-route` (6):** names the span after the route pattern; tags it with the request ID; keeps the route for a 404 thrown by a matched handler and for a handler that throws (500); leaves unmatched requests named `GET` with no `http.route`; and is a no-op without an active span.

## Decisions & trade-offs
- **`pg` replaces postgres.js**, as agreed. Drizzle's query API is the same. The only visible difference is that raw `db.execute()` returns `{ rows }`, not an array.
- **Pool `error` listener.** With `pg`, an idle connection that drops (for example when Postgres restarts) emits `error` on the pool. With no listener, Node treats that as unhandled and **crashes the process**. The listener logs a warning, and the pool replaces the connection.
- **`import-in-the-middle` is a direct dependency** (not in the plan). I use its `createAddHookMessageChannel` so the ESM hook only wraps the modules the instrumentations target (`pg`, `pg-pool`, `http`, `https`), not every import. This is the pattern the OTel docs recommend. It's the same version `@opentelemetry/instrumentation` already uses.
- **`handle.ts`** (not in the plan). `main.ts` must not import `instrumentation.ts`. Without the preload, doing so would start telemetry too late, and `pg` would silently go uninstrumented. A tiny shared handle module avoids that. Without the preload, shutdown is a no-op, and a warning is logged if telemetry was configured.
- **`@opentelemetry/sdk-trace-base` was not added** (it was in the plan). `sdk-trace-node` already re-exports `InMemorySpanExporter` and `SimpleSpanProcessor`.
- **OTel diagnostics go to LogTape.** The SDK's own messages (for example, a failed export) appear as `api.otel` records at warning level and above, instead of being silently dropped by the default no-op diag logger. Messages from before `configureLogging` runs are dropped, which only affects the first few milliseconds of start-up.
- **`requireParentSpan: true`** on the pg instrumentation. Queries outside a request (migrations, the pool warming up) create no root spans. Business code always runs inside a request span.
- **Span naming rule.** The last matched route names the span, unless the response is a 404 and the last match is middleware (`app.use`). This was probed against Hono's `matchedRoutes`: a 404 from a real handler (`notFound()` thrown in `GET /missing/:id`) still gets its route name.

## Deviations from plan
- **Added:** `import-in-the-middle` and `handle.ts`, plus the pool error listener and the diag bridge. All explained above.
- **Dropped:** the `sdk-trace-base` devDependency, because it isn't needed.
- Nothing else.

## Observations (not fixed here)
1. **Query strings in spans.** The HTTP server span records `url.path` and, when present, `url.query`. In 3.x the OAuth callback carries `code` and `state` in the query string. Redact them in spans (instrumentation-http has a hook for this) at the same time as the log redaction already noted for 3.x.
2. **2.3 conflict.** 2.3's "done when" asks for a `/health` trace *and its linked log*, but the request logger skips `/health`. I'll propose a resolution in the 2.3 plan.
3. **pg span names** follow the instrumentation's convention, `pg.query:SELECT <database>`. That's fine for Tempo searches. The useful detail is `db.query.text`.
