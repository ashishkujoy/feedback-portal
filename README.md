# Intern Feedback Portal

A web portal where mentors and program managers of an internship program record intern feedback, color codes, one-on-one conversations and decisions, so everyone works from the same record.

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- pnpm 12
- Docker (for Compose and Testcontainers)

## Getting started

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
docker compose up -d --wait postgres     # Postgres 18.6 on localhost:5433
pnpm db:migrate
pnpm db:seed                             # first admin, from BOOTSTRAP_ADMIN_EMAIL in apps/api/.env
pnpm --filter @feedback-portal/api dev   # http://localhost:3000/health
```

### Web app
```sh
pnpm dev:web     # http://localhost:5173 (fixed port: it's the API's default WEB_APP_URL)
pnpm build:web   # static build in apps/web/dist
```
- **The web app calls the API only through `/api` on its own origin.** `pnpm dev:web` and `vite preview` proxy `/api/*` to http://localhost:3000, without the `/api` prefix. Run the API too (`pnpm --filter @feedback-portal/api dev`) for the full app; the API in Docker uses the same port, so run one or the other.
- **Signed out, every page goes to `/login`**, the only page outside the shell. Navigation follows your roles: "Users and roles" is for admins, and mentors see "My batches". The sign-out button sits at the foot of the sidebar.
- **Browser tracing is off in `pnpm dev:web`.** To turn it on, put `VITE_OTEL_TRACES_URL=/otlp/v1/traces` in `apps/web/.env.local` and run Grafana LGTM (`docker compose up -d otel-lgtm`); Vite forwards `/otlp` to it.
- **The program and organisation names come from the API** (`GET /settings`, from `PROGRAM_NAME` and `ORG_NAME`). The program name shows in the sidebar, on the sign-in card and in the tab title, and the organisation name in the sign-in hint. If `/settings` fails, the app works without them.

### The first admin
- Set `BOOTSTRAP_ADMIN_EMAIL` (and optionally `BOOTSTRAP_ADMIN_NAME`) in `apps/api/.env`, then run `pnpm db:seed`. Compose runs it for you as the `seed` job.
- **The seed acts only when there is no active admin.** Then it creates that user as an admin, or, if the user exists, grants them `admin` and reactivates them. While any active admin exists, it does nothing, so it never undoes an admin's changes.
- It's safe to run on every start. If every admin is ever deactivated by mistake, running it again restores access.
- Its log line says `created`, `restored`, `admin_exists` or `not_configured`.

On macOS with Colima, run `colima start` first.

### Google sign-in (optional locally)
Without credentials, the API runs normally, and **Sign in with Google** returns to `/login` with a "Google sign-in isn't set up" notice. To try a real sign-in:

1. In Google Cloud Console, open **APIs & Services → Credentials → Create credentials → OAuth client ID**. Choose type **Web application**.
2. Add the authorised redirect URI `http://localhost:5173/api/auth/google/callback`. Sign-in goes through the web app's `/api` proxy, so the session cookie belongs to the web app's origin.
3. Put the client ID and secret in `apps/api/.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Make sure your email exists as an active user: set `BOOTSTRAP_ADMIN_EMAIL` and run `pnpm db:seed`.
5. Run the API and the web app (see "Web app"), open http://localhost:5173 and choose **Sign in with Google**.

- **After signing in**, the browser goes to `WEB_APP_URL` with the session cookie set, which is the web app's Batches page.
- **Every failure** (unknown or inactive user, cancelled, expired flow) goes to `<WEB_APP_URL>/login?error=sign_in_failed`. The API log says why, without the email.

### API endpoints (identity)
- **`GET /settings`** (public) returns `{ programName, orgName }` from config, cacheable for 5 minutes.
- **`GET /me`** returns the signed-in user (`id`, `email`, `name`, `avatarUrl`, `roles`). Without a valid session it answers **401**, and clears a bad cookie. The web app treats a 401 as "go to sign-in".
- **`POST /auth/logout`** ends the current session and clears the cookie. It always answers **204**.
- **`/users`** (admins only; everyone else gets 403):
  - `GET /users` lists every user, inactive ones included.
  - `POST /users` with `{ email, name, roles }` adds a user, who can then sign in with Google. No invite is sent.
  - `PUT /users/:id/roles` with `{ roles }` replaces their roles.
  - `POST /users/:id/deactivate` signs them out everywhere. `POST /users/:id/reactivate` lets them sign in again.
  - You can't deactivate yourself or remove your own `admin` role, and the last active admin can't be removed (409 `last_admin`).
  - A role someone uses in a batch (a current batch mentor or PM) can't be removed until they're unassigned or replaced there (409 `role_in_use`).
- **Writes must come from the web app.** A form-style or bodyless `POST`/`PUT`/`PATCH`/`DELETE` whose `Origin` isn't `WEB_APP_URL` gets **403** (CSRF check).

### API endpoints (batches)
- **`/batches`**: admins can do everything; a batch's current PM can change its mentors.
  - **Visibility:** anyone signed in can read batches, but only those they're currently assigned to (in any role); admins see all. A batch you can't see is a **404**, as if it didn't exist. Unassigning or replacing someone removes their access at once; archived batches stay visible to their members.
  - `GET /batches` lists batches (active first, newest first) with their PM and mentor count. `GET /batches/:id` adds every member, current and past.
  - `POST /batches` with `{ name, startDate, endDate, programManagerId }` creates a batch run by that PM. Names are unique ignoring case (409 `batch_name_taken`).
  - `PUT /batches/:id/program-manager` with `{ userId }` replaces the PM. A batch always has exactly one.
  - `POST /batches/:id/mentors` with `{ userId }` assigns a mentor; `DELETE /batches/:id/mentors/:userId` unassigns one. Assignments are kept as history.
  - `PUT /batches/:id/mentors` with `{ userIds }` makes that the batch's complete set of current mentors, all or nothing. `GET /batches/:id/mentor-candidates` lists who can be assigned (active Mentors, plus current mentors), with their other current batches' dates for the "load". Both are for admins and the batch's current PM.
  - `POST /batches/:id/archive` makes the batch read-only (409 `batch_archived` afterwards). There's no unarchiving.
  - Members must be active and hold the matching role (409 `member_inactive`, `member_role_mismatch`).

## Running everything in Docker

```sh
cp apps/api/.env.example apps/api/.env   # PROGRAM_NAME / ORG_NAME are read from here
docker compose up -d --build --wait      # postgres, otel-lgtm → migrate → seed (one-shot) → api → web
open http://localhost:5173               # the app (nginx: static build, /api → api, /otlp → collector)
curl localhost:3000/health/ready
open http://localhost:3001               # Grafana: traces, logs, metrics
docker compose down                      # add -v to also delete the database volume
```

- `migrate` applies pending migrations and exits, then `seed` makes sure the first admin exists (see above). The `api` service starts only after both succeed.
- Inside Docker the api always uses `NODE_ENV=production`, JSON logs and the `postgres` service. Those values override `apps/api/.env`.
- The api in Docker and `pnpm dev` both use port 3000, and the `web` container and `pnpm dev:web` both use 5173, so run one or the other of each.
- **Signing in through Docker needs Chrome or Firefox.** The api runs in production mode, so the session cookie is `__Host-session` with `Secure`. Chrome and Firefox accept that on `http://localhost`; Safari doesn't. `pnpm dev` has no such limit.
- The `web` image is the production build behind nginx: hashed `/assets/*` are cached for a year and `index.html` is always revalidated. Rebuild it (`--build`) to see UI changes; use `pnpm dev:web` for day-to-day UI work.
- To build an image alone, run `docker build -f apps/api/Dockerfile -t feedback-portal-api .` or `docker build -f apps/web/Dockerfile -t feedback-portal-web .` from the repo root.

### Observability (Grafana LGTM)
- **Grafana** is at http://localhost:3001 (local only, no login). The data is throwaway and is reset by `docker compose down`.
- **Traces:**
  - Explore → **Tempo** → search for service `feedback-portal-api`.
  - Each request is a span named after its route (`GET /health/ready`), with its `pg` query spans underneath.
  - A request's `x-request-id` is on its span as `request.id`.
- **Logs:**
  - Explore → **Loki** → `{service_name="feedback-portal-api"}`.
  - Every log line written in a request carries `trace_id`. Its **Trace** link opens the trace, and in Tempo, **Logs for this span** goes back to the logs.
- **Metrics:** Explore → **Prometheus**, for example `http_server_request_duration_seconds_count`, by `http_route`.
- **`/health` is the liveness probe.** It is neither logged nor traced, so Docker's 10 s healthcheck stays silent. `/health/ready` (which checks the DB) is logged and traced like any other request.
- **Browser traces:** the web app in Docker traces every `fetch` (service `feedback-portal-web`) and sends the spans to `/otlp/v1/traces` on its own origin. Same-origin requests carry `traceparent`, so one trace runs browser → api → `pg`: search Tempo for service `feedback-portal-web`.
- **Using it with `pnpm dev`:** set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` in `apps/api/.env` to send local runs to the same Grafana.

## Running tests

| Command | What runs | Needs Docker |
|---|---|---|
| `pnpm check` | format, lint, typecheck, all tests | yes |
| `pnpm test` | unit + integration tests in every package | yes |
| `pnpm --filter @feedback-portal/api test:unit` | API unit tests only | no |
| `pnpm --filter @feedback-portal/api test:int` | API integration tests only | yes |

- **What the integration tests (`*.int.test.ts`) use:** a throwaway `postgres:18.6-alpine` container started by Testcontainers. It is separate from the Compose database.
- **Isolation:** each test file gets its own database, cloned from a migrated template, and tables are emptied before each test.
- **Docker connection:** Testcontainers uses `DOCKER_HOST`. With Colima that is `unix://$HOME/.colima/default/docker.sock`.

## Docs

- [Product description](PRODUCT.md)
- [Tech stack](TECH_STACK.md)
- [Data model](DATA_MODEL.md)
- [Roadmap](ROADMAP.md)
- [Workflow & task status](workflow/README.md)
