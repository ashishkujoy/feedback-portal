# Intern Feedback Portal — Roadmap

Each step is small, can be reviewed on its own, and ends in a working state. We finish, verify, and commit one step before starting the next.

This file is the overview. Detailed plans, reviews, findings and status for each task live in [`workflow/`](workflow/README.md).

## Phase 0 — Foundation

| # | Step | Done when |
|---|---|---|
| 0.1 | **Git + monorepo skeleton**: `git init`, pnpm workspaces, root `package.json`, `.gitignore`, `.nvmrc` (Node 24), `apps/` and `packages/` folders | `pnpm install` works |
| 0.2 | **Shared TS config**: `packages/tsconfig` with strict base and lib configs | Packages extend the shared config |
| 0.3 | **Lint + format**: oxlint + oxfmt, with root scripts `lint`, `format`, `format:check` | `pnpm lint` and `pnpm format:check` pass |
| 0.4 | **Contracts package**: `packages/contracts` with Zod enums (`Role`, `ColorCode` + severity order, `InternStatus`, `FeedbackState`) and Vitest set up | Unit tests for the enums and severity order pass |

## Phase 1 — Backend skeleton

| # | Step | Done when |
|---|---|---|
| 1.1 | **Hono app**: `apps/api` with `GET /health` and an app factory that can be tested without a port | A Vitest test calls `/health` and passes |
| 1.2 | **Config**: env config validated with Zod, plus `.env.example` | The app refuses to start when an env var is missing |
| 1.3 | **Logging**: LogTape JSON logs to stdout, plus request-logging middleware | Each request logs method, path, status, and duration |
| 1.4 | **Error handling**: domain and application error types mapped to an HTTP problem-JSON shape | Tests cover 400, 403, 404, and 500 responses |
| 1.5 | **Postgres + Drizzle**: DB client, drizzle-kit config, migrations script | `pnpm db:migrate` runs against local Postgres |
| 1.6 | **Testcontainers harness**: Vitest global setup that starts Postgres, runs migrations, and gives each test a clean DB | An integration test hitting the DB passes |

## Phase 2 — Docker & observability

| # | Step | Done when |
|---|---|---|
| 2.1 | **Compose: postgres + api**: multi-stage Dockerfile for the api and a `docker-compose.yml` | `docker compose up` gives a working `/health` |
| 2.2 | **OpenTelemetry (api)**: Node SDK with HTTP, Hono, and pg instrumentation, and an OTLP exporter | — |
| 2.3 | **Grafana LGTM in Compose**: the api exports traces and logs to it, and log records carry `trace_id` | A trace for `/health` and its linked log appear in Grafana |

## Phase 3 — Identity (users, roles, login)

| # | Step | Done when |
|---|---|---|
| 3.1 | **Schema**: `users`, `user_roles`, `sessions` tables + migration | Migration applies cleanly |
| 3.2 | **User domain**: `User` entity, email normalization, roles, and the active/inactive rule | Unit tests pass |
| 3.3 | **User repository**: Drizzle adapter behind a port | Integration tests pass (Testcontainers) |
| 3.4 | **Bootstrap admin**: a seed script creates the first admin from `BOOTSTRAP_ADMIN_EMAIL` | The seed is idempotent |
| 3.5 | **Sessions**: create, validate, and revoke sessions with a hashed token, a cookie, and a sliding expiry | Unit and integration tests pass |
| 3.6 | **Google OAuth**: `/auth/google` and `/auth/google/callback` using Arctic. Only pre-added, active users can sign in | A test covers a known user signing in and an unknown user being rejected, with Google mocked |
| 3.7 | **Auth middleware + `GET /me`**: loads the current user and their roles, and adds `logout` | Authenticated and unauthenticated tests pass |
| 3.8 | **Admin user management API**: list, create, deactivate, and reactivate users, and grant or revoke roles | API tests pass, and non-admins get 403 |
| 3.9 | **Replace Arctic**: npm marks `arctic` and its `@oslojs/*` dependencies as no longer supported. Swap the adapter behind the `GoogleAuth` port for a maintained library or a small PKCE + token exchange | The 3.6 route and adapter tests pass unchanged against the new adapter, and `arctic` is gone from the lockfile |

## Phase 4 — Frontend skeleton

| # | Step | Done when |
|---|---|---|
| 4.1 | **Vite + React + Tailwind v4**: `apps/web` | The dev server renders a page |
| 4.2 | **Router + Query**: TanStack Router and TanStack Query providers, plus a layout shell | Navigation works |
| 4.3 | **API client**: typed fetch that validates responses with the contracts and sends cookies; Vite proxies `/api` to the api | `/me` loads |
| 4.4 | **Login flow**: login page with the Google button, route guard, user menu, and logout | A user can log in and out end to end |
| 4.5 | **Branding**: `GET /settings` returns `PROGRAM_NAME` and `ORG_NAME` from config, and the UI shows them | No program or org name is hard-coded in the web app |
| 4.6 | **Web in Compose + OTel web**: the web container, plus browser traces sent through to the api | A trace runs browser → api → db in Grafana |

## Phase 5 — Admin: users

| # | Step | Done when |
|---|---|---|
| 5.1 | **Users list page**: shows each user's roles and active state | Works for admins; the menu item is hidden for other roles |
| 5.2 | **Add user form**: name + email, validated with React Hook Form + Zod | New user can then sign in |
| 5.3 | **Edit roles and deactivate** | Changes are shown immediately |

## Phase 6 — Batches (cohort)

| # | Step | Done when |
|---|---|---|
| 6.1 | **Schema**: `batches` and `batch_members` tables, with partial unique indexes | Migration applies, and a second active PM is rejected by the DB |
| 6.2 | **Batch domain**: create or archive a batch, assign or unassign members, one PM per batch, and a user must hold the matching global role | Unit tests pass |
| 6.3 | **Batch API**: CRUD plus assignment endpoints and authorization (admin can do everything; PM can assign mentors) | API tests pass |
| 6.4 | **Visibility scope**: every batch-scoped query is filtered to the viewer's current assignments, and admins see all | A test shows a mentor cannot see an unassigned batch |
| 6.5 | **Batches UI**: batch list, create-batch form, and a batch page showing current and past members | — |
| 6.6 | **Assign/unassign UI** | — |

## Phase 7 — Interns

| # | Step | Done when |
|---|---|---|
| 7.1 | **Schema**: `interns` and `intern_status_events` tables | Migration applies |
| 7.2 | **Intern domain**: `Intern` aggregate and the status state machine (transitions, required reasons, notice dates) | Tests cover every allowed and rejected transition |
| 7.3 | **Manual add intern API + UI**: a fallback when Airtable isn't available | — |
| 7.4 | **Batch roster UI**: interns shown as cards or a table with color code, status, and filters | — |
| 7.5 | **Intern profile page**: details, interview notes, and a timeline placeholder | — |
| 7.6 | **Status change API + UI**: graduate, withdraw, lift notice, or terminate, with a reason | Only the PM can do this; final statuses are read-only |
| 7.7 | **Cloudinary photos**: a signed-upload endpoint, an upload widget, and the photo shown on the card and profile | — |
| 7.8 | **Batch card counts**: interns, on notice and terminated, and the colour bar, on the batch list (A1) | — |

## Phase 8 — Airtable import

| # | Step | Done when |
|---|---|---|
| 8.1 | **Airtable adapter**: fetch records from a base, table, and view, and validate them with Zod | Tests use recorded fixtures |
| 8.2 | **Field mapping**: map Airtable fields to intern fields and keep the raw record in `airtable_fields` | Unit tests pass |
| 8.3 | **Import preview API**: returns valid and invalid rows without writing anything | — |
| 8.4 | **Import commit API**: `airtable_imports` table; adds new interns and updates existing ones matched by username; repeatable | Re-running the import creates no duplicates |
| 8.5 | **Import UI**: enter the source, preview, confirm, and see the result | — |

## Phase 9 — Feedback

| # | Step | Done when |
|---|---|---|
| 9.1 | **Schema**: `feedback` table | Migration applies |
| 9.2 | **Feedback domain**: draft → submitted → delivered; submitting snapshots `previous_color_code` and updates the intern's color code; no reset to "none"; feedback marked as notice puts the intern `on_notice` for one month in the same transaction | Unit tests pass |
| 9.3 | **Feedback API**: create draft, edit, submit, and list per intern (drafts visible to the author only) | API tests pass |
| 9.4 | **Markdown components**: an editor with a Write/Preview toggle and a sanitized renderer | A test shows XSS content is stripped |
| 9.5 | **Write feedback UI**: period, body, color picker (with descriptions), and a "Mark as notice" switch | — |
| 9.6 | **Feedback on intern timeline**: color change badges and notice flags | — |
| 9.7 | **Color code history**: the intern's color codes over time, as a trend strip or chart | — |

## Phase 10 — Conversations & comments

| # | Step | Done when |
|---|---|---|
| 10.1 | **Schema**: `conversations` and `comments` tables, with the one-parent check | Migration applies |
| 10.2 | **Conversation domain**: only the PM records a conversation; it delivers the chosen submitted feedback | Unit tests pass |
| 10.3 | **Conversation API + UI**: pick the feedback, enter notes and date | — |
| 10.4 | **Comments API**: add, edit, and soft-delete comments on feedback or a conversation | API tests pass |
| 10.5 | **Comments UI**: a thread under each feedback entry and each conversation | — |
| 10.6 | **Unified intern timeline**: feedback, conversations, comments, and status events in date order | — |

## Phase 11 — Dashboards & polish

| # | Step | Done when |
|---|---|---|
| 11.1 | **Batch dashboard**: color distribution, interns on notice, and feedback still to be delivered | — |
| 11.2 | **"My pending" view**: for mentors, interns with no feedback this month; for the PM, submitted feedback not yet delivered | — |
| 11.3 | **Playwright E2E**: the main path: log in, write feedback, record a conversation, comment | Runs in Compose |
| 11.4 | **Production build**: nginx for the web app, production Compose, and a migrate-on-deploy job | — |

---

The next step is **0.1**.
