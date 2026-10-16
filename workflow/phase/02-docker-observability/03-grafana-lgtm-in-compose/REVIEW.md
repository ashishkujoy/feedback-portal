# 2.3 Grafana LGTM in Compose — Review

## What changed
| File | Notes |
|---|---|
| `docker-compose.yml` | New `otel-lgtm` service (`grafana/otel-lgtm:0.36.0`). Grafana is on host port **3001** and OTLP/HTTP on **4318**. The healthcheck is the image's own `healthcheck.sh` (Grafana, Loki, Tempo, Mimir and the collector) at a 5 s interval with a 60 s start period. No volume. `api` gains `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-lgtm:4318` and `OTEL_METRIC_EXPORT_INTERVAL=10000`, and now also depends on `otel-lgtm` being healthy. Its healthcheck switches to `/health`. |
| `apps/api/package.json` | **+** `@opentelemetry/sdk-logs@0.223.0`, `@opentelemetry/api-logs@0.223.0`, `@opentelemetry/exporter-logs-otlp-http@0.223.0`, `@opentelemetry/core@2.12.0` (already present indirectly; now imported for RPC metadata). No release-age exceptions and no new build scripts. |
| `src/shared/telemetry/otel-log-sink.ts` | **New.** The LogTape → OTel sink. The rendered message (unquoted) becomes the body. Properties become attributes; non-primitive values are JSON-encoded. The first `Error` property becomes `exception.*`. The record also gets a `log.category` attribute, and its instrumentation scope is the category. Levels map to OTel severities. The active context is attached. |
| `src/shared/logging/trace-context.ts` | **New.** `withTraceContext(sink)` adds `trace_id`/`span_id` from the active span. Outside a span it passes the record through unchanged. |
| `src/shared/logging/logging.ts` | The main sink is wrapped with `withTraceContext`. There's a new optional `otelSink` parameter: `api` records then go to both sinks, while `api.otel` records stay on stdout only (`parentSinks: 'override'`). Exports `otelCategory`. |
| `src/shared/telemetry/telemetry.ts` | Adds a `LoggerProvider` (same resource, `BatchLogRecordProcessor`, OTLP `/v1/logs`). `Telemetry.logSink` exposes it, and `shutdown()` flushes it. `HttpInstrumentation` ignores incoming `/health`. |
| `src/shared/telemetry/handle.ts` | `telemetryLogSink()` |
| `src/main.ts` | Passes `telemetryLogSink()` to `configureLogging` |
| `src/shared/http/request-logger.ts` | Skips only `/health`; `/health/ready` is logged |
| `src/shared/http/trace-route.ts` | Also sets the route on the HTTP instrumentation's RPC metadata, so the duration metric gets `http.route` (see deviations) |
| Tests | New `otel-log-sink.test.ts` (12), `trace-context.test.ts` (2) and logging tests (+2). Request-logger test updated (+1). The real-process integration test is extended. |
| `apps/api/.env.example`, `README.md`, `TECH_STACK.md` | Hint for sending `pnpm dev` telemetry to the stack. README: Grafana URL, finding traces, logs and metrics, the `/health` rule. TECH_STACK: logging row now describes our own sink and why `@logtape/otel` isn't used. |

## How to verify
```sh
pnpm check                                   # 45 contracts + 88 api tests
docker compose up -d --build --wait          # ~20 s on first LGTM start
curl -H 'x-request-id: demo-1' localhost:3000/health/ready
open http://localhost:3001                   # Explore → Loki: {service_name="feedback-portal-api"}
```

| Check | Result |
|---|---|
| `pnpm check` | exit 0: 45 contracts tests; 88 api tests (80 unit + 8 integration) |
| Integration (real process → test OTLP receiver) | `GET /health/ready` → server span, `select 1` span in the same trace, **log record at `/v1/logs` with body `GET /health/ready 200 …` and the server span's trace ID**, and the **stdout JSON line has the same `trace_id`**. The duration metric has `http.route=/health/ready`. `GET /health` → **no span, no log**. With no endpoint, nothing is received. |
| `docker compose up -d --build --wait` | postgres, otel-lgtm (healthy) → migrate (exit 0) → api (healthy) in about 18 s |
| **Tempo**, checked through Grafana's API | Trace for `x-request-id: grafana-check-b1`: root `GET /health/ready` with children `pg-pool.connect`, `pg.connect` and `pg.query:SELECT feedback_portal` |
| **Loki**, with the exact query Grafana's Tempo → Loki link runs | `{service_name="feedback-portal-api"} \| trace_id = "<id>"` returns `GET /health/ready 200 12.1ms`, severity INFO, scope `api.http`, with `requestId` and `trace_id` as fields |
| **Links in both directions** | Provided by LGTM's data sources. Loki → Tempo is a derived field on `trace_id`; Tempo → Loki is `tracesToLogsV2`, mapping `service.name` → `service_name`. Both rely on the fields shown above, which are present. |
| **Mimir** | `http_server_request_duration_seconds_count{http_route="/health/ready"}` = 3. The 404 series has no route, as intended. |
| `/health` probes silent | Many Docker healthchecks ran, and none are logged (0 lines in `docker compose logs api`) or traced (Tempo search `span.url.path="/health"`: 0) |
| SDK warnings | No WARN/ERROR records in the API logs |
| `docker compose stop api` | Exit 0, after "SIGTERM received" |
| Image size | 69 MB compressed, unchanged |

**Not done: a click-through in the Grafana UI.** The browser tools weren't connected, so I checked through Grafana's API: the same data sources, and the same queries the UI links run. Opening Grafana and clicking a log line's **Trace** button is a 30-second check for you.

## Decisions & trade-offs
- **Probes, option A (as planned):**
  - `/health` is neither logged nor traced, and the healthcheck uses it.
  - `/health/ready` is a normal observed request, so the done-when uses it instead of `/health`.
  - The Dockerfile `HEALTHCHECK` was already `/health`.
- **Our own OTel log sink (as planned):**
  - No duplicate OTel SDK and no gRPC or protobuf in the image; the image size is unchanged.
  - As a side effect, Loki bodies are unquoted (`GET /health/ready 200 12.1ms`). Stdout keeps LogTape's quoting, as noted in 2.1.
- **Non-primitive property values are JSON strings in Loki.** OTLP does support nested maps, but flat strings are easier to search and filter in Loki. No such values are logged yet.
- **The OTLP sink is closed during shutdown.** Anything logged after `telemetry.shutdown()` reaches stdout only. Today that's only a "shutdown failed" error.
- **No volume for LGTM.** Telemetry is reset on `docker compose down`. The API stays healthy without it, so the `depends_on` only orders start-up.

## Deviations from plan
- **The route now also goes on the HTTP instrumentation's RPC metadata.** When I checked Mimir, the duration metric had no `http_route`. The instrumentation takes metric labels from its RPC metadata, not from span attributes. `trace-route` now sets `rpcMetadata.route`, which is the same mechanism the Express instrumentation uses. Setting the span name and attribute directly is kept, so the unit tests and spans without metadata still work. `@opentelemetry/core` became a direct dependency for this, and the integration test now asserts the route on the metric.
- **Healthcheck:** the plan had a Grafana-only check. I used the image's own script instead, which waits for all five components. The API's first exports therefore never hit a half-started collector.

## Observations (not fixed here)
1. **Resource:** `deployment.environment.name` is `production` in Compose because `NODE_ENV=production`. That's accurate for the container, but every local Compose run shows as "production" in Grafana. If it matters, a separate `DEPLOYMENT_ENV` can come with deployment (11.x).
2. **The redaction notes still stand** for 3.x: query strings in spans and logs, and Drizzle error params.
