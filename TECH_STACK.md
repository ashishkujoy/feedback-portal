# Intern Feedback Portal — Tech Stack

Items marked _(chosen)_ were picked to fill gaps in the original list. They can be swapped.

## 1. Common

| Concern | Choice |
|---|---|
| Runtime / language | Node.js 24 LTS + TypeScript (strict) |
| Monorepo | pnpm workspaces _(chosen)_ |
| Shared contract | `packages/contracts`: Zod schemas and inferred types, shared by the API and the web app |
| Validation | Zod at every boundary: HTTP input and output, env config, Airtable records, DB-to-domain mapping |
| Code style | Arrow functions preferred. **oxlint** for linting and **oxfmt** for formatting (both Rust-based, from the Oxc project) |
| Containers | Docker (multi-stage builds). Docker Compose runs the whole application locally |
| Observability | OpenTelemetry SDK (traces, metrics, logs) → **Grafana LGTM** _(chosen)_ |

### Why Grafana LGTM for traces
The `grafana/otel-lgtm` image runs an OTel Collector, Tempo (traces), Loki (logs), Prometheus (metrics), and Grafana in **one container**. It adds a single service to Compose. Logs carry `trace_id`, so you can jump from a log line to its trace. For production, point the OTLP exporter at any OTLP backend, such as Grafana Cloud or Honeycomb, with no code changes.

## 2. Backend (`apps/api`)

| Concern | Choice |
|---|---|
| HTTP framework | Hono (`@hono/node-server`), with `@hono/zod-validator` using the shared contracts |
| Database | PostgreSQL 18 (18.6; image `postgres:18.6-alpine`) |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| Postgres driver | **pg** (node-postgres) _(chosen)_. It is the only driver with official OpenTelemetry instrumentation (`@opentelemetry/instrumentation-pg`: query spans and pool metrics). postgres.js was used until 2.2. |
| Architecture | Domain-Driven Design. Details below |
| Auth | Google OAuth 2.0 / OIDC using **Arctic** _(chosen)_. Only emails an admin has added can sign in. Sessions are stored server-side in Postgres, keyed by the SHA-256 hash of a 256-bit random token. The browser holds the token in an HttpOnly, SameSite=Lax cookie, which is `__Host-session` and Secure in production. Sessions expire after 7 days without use, and at most 30 days after sign-in. No session secret: an unguessable token needs no signature. CSRF: SameSite=Lax, plus Hono's `csrf()` origin check against `WEB_APP_URL` on writes |
| Authorization | Role and batch-scope checks in the application layer (Admin / PM / Mentor, limited to assigned batches) |
| Photo storage | Cloudinary. The backend issues signed uploads, and the DB stores only `public_id` |
| Airtable | Repeatable import per batch using the Airtable REST API. Records are validated with Zod, the admin or PM sees a preview (new vs updated) and confirms, and interns are matched by username so re-running it creates no duplicates |
| Logging | **LogTape** (zero dependencies). Structured JSON logs to stdout, plus our own small LogTape → OpenTelemetry sink (`shared/telemetry/otel-log-sink.ts`) that sends logs over OTLP to Grafana LGTM. `@logtape/otel` was not used, because it pins an older OTel SDK and bundles the gRPC and protobuf exporters. Records written inside a traced request carry `trace_id` and `span_id`. Each module gets its own logger category (for example `["api", "feedback"]`) |
| Testing | Vitest. Testcontainers (Postgres) for integration and repository tests. Unit tests for domain logic without I/O |
| Markdown safety | Markdown is stored as raw text and sanitized when rendered (see Frontend) |

### DDD structure

The backend is split into bounded contexts:
- **identity**: users, roles, sessions, Google login
- **cohort**: batches, and assigning mentors and PMs to batches
- **intern**: intern profile, status lifecycle, Airtable import, photo
- **feedback**: feedback entries, color codes, notice, conversations, comments

```
apps/api/src/
  modules/
    <context>/
      domain/          # entities, value objects (ColorCode, InternStatus), domain events, invariants
      application/     # use cases (commands/queries), ports (repository interfaces)
      infrastructure/  # Drizzle repositories, Airtable/Cloudinary adapters
      http/            # Hono routes → use cases
  shared/              # config (zod-validated env), db, logger, telemetry, errors, auth middleware
  main.ts              # composition root (manual DI: build the adapters, pass them to the use cases)
```

- The domain layer does not import Hono, Drizzle, or any SDK.
- Invariants live in the domain. Examples:
  - A color code can change only through a feedback entry.
  - Feedback marked as notice puts the intern on notice when it is submitted. Only the PM can lift notice or terminate.
  - Only allowed status transitions can happen.

## 3. Frontend (`apps/web`)

| Concern | Choice |
|---|---|
| Framework | React 19 + Vite |
| Routing | TanStack Router _(chosen: type-safe routes and search params, fits well with TanStack Query)_ |
| Server state | TanStack Query |
| Client state | Zustand, for UI state only (filters, drafts, panels) and never for server data |
| Styling | Tailwind CSS v4 |
| Forms | React Hook Form + `@hookform/resolvers/zod` using the shared contracts _(chosen)_ |
| API client | Typed fetch wrapper that validates responses against the shared contracts _(chosen)_ |
| Markdown | Editor: textarea with a live preview tab. Render: `react-markdown` + `remark-gfm` + `rehype-sanitize` _(chosen)_ |
| Testing | Vitest + Testing Library. Playwright for end-to-end tests _(chosen)_ |
| Telemetry | OTel web SDK (fetch instrumentation) so traces run from the browser to the API to the DB |

## 4. Repository layout

```
feedback-portal/
  apps/
    api/            # Hono backend
    web/            # React + Vite frontend
  packages/
    contracts/      # Zod schemas + types (API DTOs, enums: ColorCode, InternStatus, Role)
    tsconfig/       # shared TS configs
  docker/
  docker-compose.yml   # postgres, api, web, otel-lgtm
  PRODUCT.md
  TECH_STACK.md
```

## 5. Docker Compose services (local)

| Service | Purpose | Port |
|---|---|---|
| `postgres` | Postgres 18.6 | 5433 on the host (avoids a local Postgres on 5432) → 5432 in the container |
| `api` | Hono API | 3000 |
| `web` | Vite dev server locally; static build served by nginx in production | 5173 |
| `otel-lgtm` | OTel Collector + Grafana UI | 4317/4318 (OTLP), 3001 (Grafana) |

## 6. Configuration

- All env vars are validated with Zod at startup. The app refuses to start if config is invalid.
- Branding comes **only from config**: `PROGRAM_NAME` and `ORG_NAME` are **required** env vars with no defaults. The API serves them to the web app through `GET /settings`.
- **No program or organisation name is hard-coded** in code, tests, fixtures, `.env.example`, package names, or file and folder names. Code uses neutral names (for example `feedback-portal`, `@feedback-portal/*`). `.env.example` uses placeholders.
- Secrets: Google client ID and secret, Cloudinary credentials, and Airtable token. These live in `.env` locally, and `.env.example` is committed.
