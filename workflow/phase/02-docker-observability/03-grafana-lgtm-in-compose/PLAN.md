# 2.3 Grafana LGTM in Compose — Plan

**Phase:** 2 — Docker & observability
**Status:** Done

## Goal
The api exports traces and logs to it, and log records carry `trace_id`

## Done when
- `docker compose up` also starts **Grafana LGTM**. Grafana is at `http://localhost:3001`.
- The API sends traces, metrics **and logs** to it over OTLP/HTTP.
- Every log record written during a traced request carries `trace_id` and `span_id`. This applies both on stdout (JSON lines) and in Loki.
- **A trace for `/health/ready` and its linked log appear in Grafana.** You can open the trace from the log line in Loki, and see the request's logs from the trace in Tempo. Why it's `/health/ready` and not `/health` is explained in the next section.
- `pnpm check` passes. Integration tests cover log export and `trace_id` correlation.

## Plan

### Decision needed: health probes (the conflict from 2.2)
The roadmap's "done when" asks for a `/health` trace *and its linked log*. But the request logger **skips** `/health` and `/health/ready`, because Docker's healthcheck hits them every 10 s. These options give both a trace and a log without flooding either:

| Option | `/health` (liveness, no DB) | `/health/ready` (DB round trip) | Docker healthcheck |
|---|---|---|---|
| **A** *(recommended)* | Not logged, **not traced** | **Logged and traced** | Switches to `/health` |
| B | Logged at `debug`, traced | Same | Unchanged (`/health/ready`) |
| C | Not logged, not traced | Not logged, not traced | Unchanged. The done-when uses a 404 request instead, and DB spans aren't visible until 3.x. |

**Why A:**
- The frequent probe (`/health`, every 10 s) disappears from both logs and traces.
- `/health/ready` becomes an ordinary, fully observable request: a log line with `trace_id`, plus a trace with the DB span under it. That's the meaningful thing to show in Grafana now.
- The 2.2 end-to-end test keeps working unchanged.

**Trade-offs of A:**
- A later `web` service (4.x) can only wait on the API's liveness, not readiness. That's fine, because nginx doesn't need the DB to start.
- Production readiness probes (11.x) would log at `info`. Revisit when deployment is designed.

The rest of the plan assumes A, so the done-when above uses `/health/ready`.

### Decision needed: how logs get to OTLP
TECH_STACK names **`@logtape/otel`**. Its latest version (2.4.1) pins OpenTelemetry **0.208** (`^0.208.0` on a 0.x version allows 0.208.x only). It also bundles the **gRPC and proto** log exporters. We'd get:
- a second copy of the OTel SDK next to our 0.223;
- `@grpc/grpc-js` and `protobufjs` in the production image;
- and it requires LogTape 2.4 (we're on 2.3.10).

| Option | Trade-off |
|---|---|
| **A. Our own LogTape → OTel sink** *(recommended)* | About 40 lines in `shared/telemetry/otel-log-sink.ts`. It writes LogTape records to an `@opentelemetry/sdk-logs` `LoggerProvider` (0.223, same as traces) with the OTLP/HTTP log exporter. The message becomes the body; properties become attributes; errors become `exception.*` attributes; levels map to OTel severity. The SDK attaches the active span context, so Loki records link to Tempo automatically. This follows the same "small own code over a heavy dependency" choice we made for the request logger and the validator. |
| B. `@logtape/otel` 2.4.1 | No code to write. Costs the duplicate SDK and gRPC/protobuf deps above, plus a LogTape upgrade to 2.4.x. |

The rest of the plan assumes **A**. TECH_STACK's logging row will be updated to match.

### Packages (exact pins, all older than 1 day)
| Package | Version | Where |
|---|---|---|
| `@opentelemetry/sdk-logs` | 0.223.0 | deps |
| `@opentelemetry/api-logs` | 0.223.0 | deps |
| `@opentelemetry/exporter-logs-otlp-http` | 0.223.0 | deps |
| `grafana/otel-lgtm` image | **0.36.0** | Compose. 0.37.0 was published today. |

### Logs carry `trace_id`
- **Stdout:** a small wrapper sink adds `trace_id` and `span_id` from the active span to each record's properties before formatting, but only when a span is active. JSON lines then look like `{"…","properties":{"requestId":"…","trace_id":"4bf9…","span_id":"00f0…"}}`. With telemetry off there is no active span, so nothing is added.
- **OTLP:** the OTel `LogRecord` carries the trace and span IDs natively, which is what Loki and Grafana use for the log → trace link.
- **No feedback loop:** records from `api.otel` (the SDK's own diagnostics, such as "export failed") go to **stdout only**, never to the OTLP sink. Otherwise a failing export could log, then export, then fail again.

### Wiring
- **`telemetry.ts`:** gains a `LoggerProvider` (same resource as traces, `BatchLogRecordProcessor`, OTLP exporter to `<endpoint>/v1/logs`). `Telemetry` exposes `logSink` for LogTape. `shutdown()` flushes logs too.
- **`logging.ts`:** `configureLogging(log, { sink?, otelSink? })`.
  - The main sink is wrapped with the trace-context enricher.
  - When `otelSink` is given, the `api` category also logs to it. `api.otel` overrides to stdout only.
- **`main.ts`:** reads the log sink from the telemetry handle, if telemetry started, and passes it to `configureLogging`.
- **Shutdown order** stays server → DB → telemetry (now also flushing logs) → `dispose()`. Records logged while telemetry shuts down go to stdout only, because the OTLP sink is already closed.
- **Health probes (option A):**
  - The request logger skips only `/health`.
  - `HttpInstrumentation` gets `ignoreIncomingRequestHook` for `/health`.
  - Compose and Dockerfile healthchecks switch to `/health`.

### Compose
```yaml
otel-lgtm:
  image: grafana/otel-lgtm:0.36.0
  ports:
    - '3001:3000'   # Grafana (3000 is the api)
    - '4318:4318'   # OTLP/HTTP, so `pnpm dev` on the host can export too
  healthcheck: …     # Grafana /api/health
api:
  environment:
    OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-lgtm:4318
    OTEL_METRIC_EXPORT_INTERVAL: 10000
  depends_on:
    otel-lgtm: { condition: service_healthy }
```
- **No volume.** Telemetry is throwaway local data and is reset on `docker compose down`. A named volume is easy to add later if you want history to survive restarts.
- **Grafana runs with the image's default anonymous admin access.** That's fine for local only; it isn't a production setup.
- **`migrate` doesn't export**, since it has no preload.
- **`pnpm dev` on the host:** set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` in `.env` to see local runs in the same Grafana. `.env.example` gets that hint.

### Tests
- **Unit:**
  - **Trace-context enricher:** adds `trace_id`/`span_id` inside an active span, adds nothing outside one, and leaves the other properties alone.
  - **OTel sink:** a `LoggerProvider` with an in-memory exporter (`InMemoryLogRecordExporter` from sdk-logs) checks:
    - the body is the rendered message and properties become attributes;
    - an error property becomes `exception.type`, `exception.message` and `exception.stacktrace`;
    - each LogTape level maps to the right severity number and text;
    - a record inside an active span carries that span's trace and span IDs.
  - **Logging config:** `api.otel` records never reach the OTel sink.
  - **Request logger:** `/health` is skipped and `/health/ready` is logged. This updates the existing test.
- **Integration:** extend the 2.2 real-process test, using the same OTLP receiver.
  - `GET /health/ready` produces a log record at `/v1/logs` with message `GET /health/ready 200 …`, whose `traceId` equals the server span's trace ID.
  - The stdout JSON line for that request carries the same `trace_id`.
  - A `GET /health` request produces **no** span and **no** log.

### Files
```
docker-compose.yml                         # + otel-lgtm; api OTEL_* env, depends_on; healthcheck → /health
apps/api/Dockerfile                        # HEALTHCHECK stays /health (already)
apps/api/.env.example                      # OTLP endpoint hint for host runs
apps/api/src/shared/telemetry/
  telemetry.ts                             # + LoggerProvider, logSink, ignore /health
  otel-log-sink.ts (+ test)                # LogTape → OTel logs
apps/api/src/shared/logging/
  logging.ts (+ test)                      # otelSink option, trace-context enricher, api.otel stdout-only
  trace-context.ts (+ test)                # adds trace_id / span_id
apps/api/src/shared/http/request-logger.ts # skip /health only
apps/api/src/main.ts                       # pass the log sink to configureLogging
README.md, TECH_STACK.md                   # Grafana URL and how to find a trace; logging row
```

### Out of scope
- **Grafana dashboards and alerts:** 11.x. LGTM's built-in data sources and Explore are enough for now.
- **Browser telemetry:** 4.6.
- **Log redaction:** 3.x, as already noted.
- **Production OTLP backend settings:** 11.x.

### Steps
1. Install packages (release-age check). Pin the LGTM image.
2. Write the trace-context enricher and the OTel sink with unit tests. Update `logging.ts` and its tests.
3. Add the `LoggerProvider` and the `/health` ignore to telemetry. Wire `main.ts`. Change the request logger to skip `/health` only.
4. Extend the real-process integration test (logs + correlation + `/health` silent).
5. Update Compose (`otel-lgtm`, API env, healthchecks), `.env.example`, README and TECH_STACK.
6. Manual check in Grafana:
   - `docker compose up -d --build --wait`, then `curl /health/ready` a few times.
   - **Explore → Tempo:** the `GET /health/ready` trace with its `pg` spans.
   - **Explore → Loki:** the log line with `trace_id`, and the link back to the trace.
   - Metrics are visible in Prometheus (`http_server_request_duration…`).
   - I'll describe what I see, with a screenshot if the browser tools are available.
7. `pnpm check`. Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- In Grafana at `localhost:3001`, a `/health/ready` trace and its log line link to each other in both directions.
- `docker compose logs api` shows JSON lines with `trace_id` for `/health/ready`, and nothing for the 10 s `/health` probes.
