# 2.2 OpenTelemetry (api) — Plan

**Phase:** 2 — Docker & observability
**Status:** Done

## Goal
Node SDK with HTTP, Hono, and pg instrumentation, and an OTLP exporter

## Done when
- **Traces:**
  - With `OTEL_EXPORTER_OTLP_ENDPOINT` set, every API request produces a **server span named after the route** (for example `GET /health/ready`, with the `http.route` attribute).
  - Every DB query produces a **child span** in the same trace.
  - Traces are exported over OTLP/HTTP.
- **Metrics:** HTTP server duration and DB pool metrics are exported over OTLP/HTTP.
- **Shutdown:** `SIGTERM` flushes pending spans and metrics before exit.
- **Off by default:** without `OTEL_EXPORTER_OTLP_ENDPOINT`, telemetry is off. Nothing is exported, nothing tries to connect, and nothing is logged.
- **Privacy:** no query parameter values appear in spans.
- **Tests:** an integration test spawns the real API with telemetry on, points it at an in-test OTLP receiver, and asserts on the received spans and their parent-child links.
- `pnpm check` passes.

## Plan

### Decision needed: the DB driver
The roadmap says "pg instrumentation", but in 1.5 we chose **postgres.js** (zero deps). **There is no OpenTelemetry instrumentation for postgres.js.** Drizzle 0.45 has no tracing of its own either.

| Option | Trade-off |
|---|---|
| **A. Switch to `pg` (node-postgres) + `@opentelemetry/instrumentation-pg`** *(recommended)* | Official, mature instrumentation. One span per query (`db.query.text` with placeholders, no values), pool metrics, and the right parent-child links with no code from us. The switch is small now: `client.ts`, `migrate.ts` and `test/test-db.ts`. Drizzle supports both drivers with the same query API. Cost: `pg` brings 5 small dependencies (pg-pool, pg-protocol, pg-types, pgpass, pg-connection-string), with no install scripts. |
| B. Keep postgres.js and add manual spans | Wrap queries in our own spans in the DB layer. It's simple for `ping`, but every repository call or transaction would need wrapping, and we'd miss queries Drizzle runs internally (migrations, relational queries). There are no pool metrics. |

I recommend **A**. Browser → API → DB tracing is a stated goal (4.6), and only A gives complete DB spans. The rest of this plan assumes A.

### Packages (exact pins, all older than 1 day; checked again at install)
I'm using individual packages, **not `@opentelemetry/sdk-node`**. That meta package pulls in the gRPC, proto, Zipkin, Jaeger and Prometheus exporters, which we don't need.

| Package | Version | Where |
|---|---|---|
| `@opentelemetry/api` | 1.9.1 | deps |
| `@opentelemetry/sdk-trace-node` | 2.12.0 | deps |
| `@opentelemetry/sdk-metrics` | 2.12.0 | deps |
| `@opentelemetry/resources` | 2.12.0 | deps |
| `@opentelemetry/semantic-conventions` | 1.43.0 | deps |
| `@opentelemetry/instrumentation` | 0.223.0 | deps (`registerInstrumentations` and the ESM loader hook) |
| `@opentelemetry/instrumentation-http` | 0.223.0 | deps |
| `@opentelemetry/instrumentation-pg` | **0.75.0** | deps. 0.76.0 is less than 1 day old. |
| `@opentelemetry/exporter-trace-otlp-http` | 0.223.0 | deps |
| `@opentelemetry/exporter-metrics-otlp-http` | 0.223.0 | deps |
| `pg` | 8.23.1 | deps, replaces `postgres` |
| `@types/pg` | 8.23.1 | devDeps |
| `@opentelemetry/sdk-trace-base` | 2.12.0 | devDeps, for `InMemorySpanExporter` in unit tests |

- **OTLP over HTTP/JSON** (the `-http` exporters), not gRPC or protobuf. This needs no protobufjs and no grpc-js. Grafana LGTM (2.3) accepts it on port 4318.
- **No `@hono/otel`.** It creates its own spans, which would duplicate the HTTP instrumentation's server span. Instead I'll write about 10 lines of middleware that renames the existing server span (below).

### How it loads (native TS + ESM)
Instrumentation must patch `pg` and `http` **before** they are imported. With ESM that means a **loader hook registered before the app's module graph loads**. Importing a telemetry module from `main.ts` is too late, because static imports are all resolved before any code runs.

- **`src/instrumentation.ts`** is the new preload entry:
  - It loads config, registers `@opentelemetry/instrumentation/hook.mjs` with `module.register`, and starts telemetry.
  - It exports the handle so `main.ts` can shut telemetry down.
- **Start commands** get `--import ./src/instrumentation.ts`: the `dev` and `start` scripts, and the Dockerfile `CMD`. The `migrate` command does not.
- When telemetry is disabled, `instrumentation.ts` does nothing: no hook, no providers. `main.ts` without `--import` still works, with telemetry off.

### Config (`shared/config`), standard OTel env names
| Env var | Default | Notes |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset → **telemetry off** | Must be an `http(s)://` URL, e.g. `http://localhost:4318` |
| `OTEL_SERVICE_NAME` | `feedback-portal-api` | A technical name, not the program name |
| `OTEL_SDK_DISABLED` | `false` | `true` forces telemetry off even with an endpoint |
| `OTEL_METRIC_EXPORT_INTERVAL` | `60000` | ms. Compose (2.3) sets it lower. |

- These map to `config.telemetry = { enabled, endpoint, serviceName, metricExportIntervalMs }`, validated by Zod like everything else.
- `.env.example` documents them, commented out.

### Telemetry setup (`shared/telemetry/telemetry.ts`)
`startTelemetry(config) → { shutdown }` sets up the following:
- **Resource:** `service.name`, `service.version` (from `package.json`) and `deployment.environment.name` (= `NODE_ENV`).
- **Traces:** `NodeTracerProvider` with a `BatchSpanProcessor` and the OTLP trace exporter. Sampling is the SDK default (parent-based, always on). W3C trace-context propagation is the default, which the web app (4.6) needs.
- **Metrics:** `MeterProvider` with a `PeriodicExportingMetricReader` and the OTLP metric exporter.
- **Instrumentations:**
  - **http:** server and client spans, and the `http.server.request.duration` metric.
  - **pg:** query spans and pool metrics. `enhancedDatabaseReporting: false` keeps parameter values out of spans. `requireParentSpan: true` drops spans for queries with no request around them, such as pool start-up.
- **`shutdown()`:** flushes and shuts down both providers, with a time limit.

### Route-named spans (`shared/http/trace-route.ts`)
- The HTTP instrumentation names the server span only `GET`, because it doesn't know Hono's routes.
- A middleware runs after routing. It sets `http.route` to Hono's matched route pattern (for example `/interns/:id`, never the raw path with IDs) and renames the active span to `GET /interns/:id`.
- It is registered in `createBaseApp()`. Without an active span it does nothing.
- The **request ID** is added to the span as the `request.id` attribute, so a trace can be found from a problem response's `requestId`. Putting `trace_id` on log records is 2.3.

### Shutdown order (`main.ts`)
1. `closeServer()`
2. `database.close()`
3. **`telemetry.shutdown()`** (new): flushes the last spans, including the DB close.
4. `dispose()` (logs)
5. exit

The existing 10 s force-exit timer still covers all of it.

### Tests
- **Unit:**
  - **Config:** telemetry is off when no endpoint is set, on when one is set, and forced off by `OTEL_SDK_DISABLED=true`. A non-URL endpoint is rejected. The service-name default is applied.
  - **`trace-route` middleware:** uses a test `BasicTracerProvider` with an `InMemorySpanExporter` and an AsyncLocalStorage context manager. A request to `/things/:id` renames the span to `GET /things/:id` and sets `http.route` to the pattern. It also sets `request.id`. Unmatched routes (404) keep a generic name and never include the raw path. With no active span, nothing breaks.
- **Integration (`telemetry.int.test.ts`):**
  - Starts a tiny OTLP/JSON receiver on a random port inside the test. Spawns the real API with `node --import ./src/instrumentation.ts src/main.ts`, pointed at the test DB and the receiver.
  - `GET /health/ready`, then `SIGTERM` (shutdown flushes everything). Asserts that:
    - there's a server span `GET /health/ready` with `http.route=/health/ready` and status 200;
    - there's a `pg` span for `select 1` with the **same trace ID**, whose parent chain leads to the server span;
    - `db.query.text` contains no parameter values;
    - metrics arrived at `/v1/metrics`;
    - the process exited with code 0.
  - A second run without the endpoint confirms the receiver gets **nothing** and the API still serves.
- The existing DB integration tests run unchanged on `pg`.

### Files
```
apps/api/
  package.json                          # deps; dev/start: --import ./src/instrumentation.ts
  Dockerfile                            # CMD gets --import
  .env.example                          # OTEL_* (commented)
  src/instrumentation.ts                # preload entry
  src/shared/telemetry/telemetry.ts     # startTelemetry → { shutdown }
  src/shared/http/trace-route.ts        # route-named spans + request.id
  src/shared/config/config.ts           # telemetry section
  src/shared/db/client.ts, migrate.ts   # postgres.js → pg
  test/test-db.ts, global-setup.ts      # postgres.js → pg
  src/main.ts                           # telemetry.shutdown() in the shutdown order
TECH_STACK.md                           # Postgres driver row: pg (and why)
```

### Out of scope
- **Grafana LGTM in Compose**, **OTLP log export** (`@logtape/otel`) and **`trace_id` on log records:** 2.3.
- **A conflict to settle in 2.3:** the 2.3 "done when" wants a `/health` trace *and its linked log*, but the request logger skips `/health`. I'll raise it in 2.3.
- **Browser traces:** 4.6.
- **Custom business spans and metrics** (feedback submitted, and so on): added with their features.
- **Tail sampling and production exporter settings:** 11.x.

### Steps
1. Install packages (release-age check), swap `postgres` → `pg`, and rerun the existing DB tests.
2. Add the config section and its tests.
3. Write `telemetry.ts`, `instrumentation.ts` and the `trace-route` middleware with its unit tests. Wire up shutdown.
4. Write the OTLP receiver integration test and make it pass.
5. Update the scripts, Dockerfile, `.env.example` and TECH_STACK.
6. Manual checks:
   - `pnpm dev` with no endpoint: silent.
   - With `OTEL_EXPORTER_OTLP_ENDPOINT` pointing at a throwaway receiver: spans arrive.
   - The Docker image still starts and passes its healthcheck.
7. `pnpm check`. Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0, including the telemetry integration test.
- `docker compose up -d --build --wait` still gives a healthy API, with telemetry off because Compose sets no endpoint until 2.3.
