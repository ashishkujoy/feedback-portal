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
| Database | PostgreSQL 17 |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| Architecture | Domain-Driven Design. Details below |
| Auth | Google OAuth 2.0 / OIDC using **Arctic** _(chosen)_. Only emails an admin has added can sign in. Sessions are stored server-side in Postgres, and the browser holds an HttpOnly, Secure, SameSite=Lax cookie |
| Authorization | Role and batch-scope checks in the application layer (Admin / PM / Mentor, limited to assigned batches) |
| Photo storage | Cloudinary. The backend issues signed uploads, and the DB stores only `public_id` |
| Airtable | One-time import per batch using the Airtable REST API. Records are validated with Zod, admins see a preview and confirm before the import, and the import is idempotent on Airtable record ID |
| Logging | **LogTape** (zero dependencies). Structured JSON logs to stdout, plus `@logtape/otel` to send logs over OTLP to Grafana LGTM. Trace and span IDs from the active OTel context are added to every record. Each module gets its own logger category (for example `["api", "feedback"]`) |
| Testing | Vitest. Testcontainers (Postgres) for integration and repository tests. Unit tests for domain logic without I/O |
| Markdown safety | Markdown is stored as raw text and sanitized when rendered (see Frontend) |

### DDD structure

The backend is split into bounded contexts:
- **identity**: users, roles, sessions, Google login
- **cohort**: batches, and assigning mentors and PMs to batches
- **intern**: intern profile, status lifecycle, Airtable import, photo
- **feedback**: feedback entries, color codes, notice recommendations, conversations, comments

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
  - Only the PM can confirm notice.
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
| `postgres` | Postgres 17 | 5432 |
| `api` | Hono API | 3000 |
| `web` | Vite dev server locally; static build served by nginx in production | 5173 |
| `otel-lgtm` | OTel Collector + Grafana UI | 4317/4318 (OTLP), 3001 (Grafana) |

## 6. Configuration

- All env vars are validated with Zod at startup. The app refuses to start if config is invalid.
- Branding comes **only from config**: `PROGRAM_NAME` and `ORG_NAME` are **required** env vars with no defaults. The API serves them to the web app through `GET /settings`.
- **No program or organisation name is hard-coded** in code, tests, fixtures, `.env.example`, package names, or file and folder names. Code uses neutral names (for example `feedback-portal`, `@feedback-portal/*`). `.env.example` uses placeholders.
- Secrets: Google client ID and secret, Cloudinary credentials, Airtable token, and session secret. These live in `.env` locally, and `.env.example` is committed.
