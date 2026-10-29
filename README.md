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

### Intern photos (optional)
Photos are stored in Cloudinary; the database keeps only each photo's `public_id`.
1. Copy the **API environment variable** from your Cloudinary dashboard (`cloudinary://<key>:<secret>@<cloud>`).
2. Put it in `apps/api/.env` as `CLOUDINARY_URL`, and optionally set `CLOUDINARY_FOLDER` (default `feedback-portal/interns`).
3. Restart the API. `GET /settings` then reports `photos: true`, and the batch's admins and PM get **Add photo** on intern profiles.

The browser uploads straight to Cloudinary with a signature from the API, and the API checks Cloudinary's signed answer before saving. Without `CLOUDINARY_URL`, photos are off and initials are shown everywhere.

### API endpoints (imports)
- **`POST /batches/:batchId/imports/preview`** with `{ token, baseId, tableId, view }` reads the Airtable view and answers what an import would do: `counts` (new, updated, invalid), the new and updated rows, and the invalid rows with their reasons. **Nothing is written, and the token is never stored or logged.** For admins and the batch's PM; 409 on an archived batch.
  - A row matching a graduated, terminated or withdrawn intern is invalid ("… has graduated, so their record is read-only.").
  - A wrong key, base, table or view, or too many records → **422** `airtable_source_invalid`; Airtable busy, slow or failing → **502** `airtable_unavailable`. The `detail` starts with Airtable's own type ("Airtable said: INVALID_PERMISSIONS. …").
- **`POST /batches/:batchId/imports`** with the same body runs the import: it reads the view again, then, **all or nothing**, adds new interns and refreshes matched ones (the mapped fields, the Airtable record id and the raw snapshot; never the username, status, colour code, photo or history). Invalid rows are skipped. It answers **201** with `{ importId, counts: { created, updated, skipped }, invalid }`. Each run is recorded in `airtable_imports` (pending → completed or failed, with the reason); a failed run changes no intern. Running the same import again adds no duplicates, and two imports of one batch run one after the other.

### Airtable columns (import, Phase 8)
The import reads these columns from your recruitment table. Names match ignoring case, spaces and apostrophes; to use other names, edit `columns` in `apps/api/src/modules/intern/application/airtable-mapping.ts`.

| Intern field | Columns accepted |
|---|---|
| Username (required) | `Username` |
| Name (required) | `Full name`, `Name` |
| Email (required) | `Email` |
| Phone | `Phone`, `Phone number` |
| Diploma branch | `Diploma branch` |
| Parents' names | `Parents' names`, `Parent names`, `Parents names` |
| Interview notes | `Interview notes` |

Every other column is kept as it is in the intern's raw Airtable record. On a re-import, these columns overwrite the portal's values (an empty cell clears the field); status, colour code, photo and history are never touched.

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
  - `GET /batches` lists batches (active first, newest first) with their PM, mentor count and **intern counts** (`interns`: the total, on notice, terminated, and one count per colour code plus `none`; every intern, whatever their status). `GET /batches/:id` adds every member, current and past.
  - `POST /batches` with `{ name, startDate, endDate, programManagerId }` creates a batch run by that PM. Names are unique ignoring case (409 `batch_name_taken`).
  - `PUT /batches/:id/program-manager` with `{ userId }` replaces the PM. A batch always has exactly one.
  - `POST /batches/:id/mentors` with `{ userId }` assigns a mentor; `DELETE /batches/:id/mentors/:userId` unassigns one. Assignments are kept as history.
  - `PUT /batches/:id/mentors` with `{ userIds }` makes that the batch's complete set of current mentors, all or nothing. `GET /batches/:id/mentor-candidates` lists who can be assigned (active Mentors, plus current mentors), with their other current batches' dates for the "load". Both are for admins and the batch's current PM.
  - `POST /batches/:id/archive` makes the batch read-only (409 `batch_archived` afterwards). There's no unarchiving.

### API endpoints (interns)
- **`PUT /batches/:batchId/interns/:internId/details`** with `{ name, email, phone?, diplomaBranch?, parentNames?, interviewNotes? }` replaces an intern's details and answers with the profile. **The username can't change** (imports match on it; one sent is ignored). Admins and the batch's PM only; 409 `batch_archived` or `intern_read_only`.
- **Photos** (admins and the batch's PM; not in an archived batch or for a read-only intern; **503** when photos are off):
  - `POST /batches/:batchId/interns/:internId/photo-upload` returns a signed upload ticket for one new photo (JPG or PNG).
  - `PUT /batches/:batchId/interns/:internId/photo` with Cloudinary's answer `{ publicId, version, signature, bytes }` saves the photo after checking the signature, that the photo was issued for this intern, and that it's 5 MB or less. It answers with the updated profile, and deletes the photo it replaced.
  - `photoUrl` on interns is a 128px face-centred image, or `null`.
- **`POST /batches/:batchId/interns/:internId/status-changes`** with `{ action, reason }` (`action`: `lift_notice`, `terminate`, `graduate` or `withdraw`; `reason`: Markdown, required) changes an intern's status and answers with the updated profile. **Only the batch's current programme manager** can do this (otherwise 403, or 404 when they can't see the batch), never in an archived batch (409 `batch_archived`). Forbidden changes are 409 `invalid_status_transition`, and final interns are 409 `intern_read_only`. Two changes at the same time are made one after the other.
- **`GET /batches/:batchId/interns/:internId`** returns one intern's profile (`InternDetail`): their details, interview notes (Markdown), `source` (`manual` or `airtable`), who added them, and the status history newest first, with who made each change. It's open to anyone who can see the batch; an intern of another batch, or an unknown one, is a **404**.
- **`GET /batches/:batchId/interns`** lists the batch's interns (`InternSummary`: username, name, email, status, colour code, notice end), by name ignoring case. Anyone who can see the batch can read it, archived or not; otherwise a **404**.
- **`POST /batches/:batchId/interns`** with `{ username, name, email, phone?, diplomaBranch?, parentNames?, interviewNotes? }` adds an intern by hand (when they aren't in Airtable). It answers **201** with the intern (Active, no colour code) and records the onboarding event.
  - **Who:** admins and the batch's current PM. A batch you can't see is a **404**; one you can see but don't run is a **403**; an archived one is **409** `batch_archived`.
  - **Usernames** are stored lower-cased, without a leading `@`, and are unique within the batch ignoring case (409 `intern_username_taken`). Emails are lower-cased; blank optional fields become empty.
  - Members must be active and hold the matching role (409 `member_inactive`, `member_role_mismatch`).

### API endpoints (feedback)
All under **`/batches/:batchId/interns/:internId/feedback`**. Anyone who can see the batch reads it; **its current mentors and PM write** (an admin only when assigned to the batch; otherwise 403). Archived batches are read-only (409 `batch_archived`), and so are graduated, terminated and withdrawn interns (409 `intern_read_only`; a draft can still be discarded).
- **`GET /`** lists submitted and delivered feedback **plus your own drafts** (`FeedbackView`, drafts first, then newest submitted). Someone else's draft is invisible, and a **404** on every write.
- **`POST /`** with `{ period, body, colorCode, givesNotice, submit? }` creates a draft (201). With **`submit: true`** it's submitted in the same request: either it's submitted or nothing is saved. Submitting sets the intern's colour (when one is given) and, with `givesNotice`, puts an Active intern on notice for one month.
- **`PUT /:feedbackId`** replaces a draft's content, and submits it with `submit: true`. 409 `feedback_not_draft` once submitted.
- **`PATCH /:feedbackId`** with `{ body }` edits the text of your submitted feedback.
- **`DELETE /:feedbackId`** discards your draft (204).
- **Times are UTC.** Timestamps go out as UTC ISO strings for the browser to show in local time, and "today" (a notice's start, the latest month that can be chosen) is the UTC date. `period` is the first of a month, from the batch's start month to the current one. Two submissions for the same intern run one after the other (a second notice is 409 `intern_not_active`).

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
| `pnpm e2e` | Playwright end-to-end tests against the Compose stack | yes |

- **What the integration tests (`*.int.test.ts`) use:** a throwaway `postgres:18.6-alpine` container started by Testcontainers. It is separate from the Compose database.
- **Isolation:** each test file gets its own database, cloned from a migrated template, and tables are emptied before each test.
- **Docker connection:** Testcontainers uses `DOCKER_HOST`. With Colima that is `unix://$HOME/.colima/default/docker.sock`.

### End-to-end tests

`pnpm e2e` exercises the main path in Chromium:
1. sign in;
2. give feedback from My pending;
3. record the conversation that delivers it;
4. comment on it.

It also checks that an unknown email is turned away, and that sign-out works.
- **The stack:** `e2e/compose.yml` builds the production api and web images and starts them with a throwaway database. It also starts a **stand-in for Google** (`e2e/fake-google`), which asks for an email instead of a Google account.
- **Isolation:** the stack is a separate Compose project with no host ports. It never touches the dev stack's data, and both can run at once.
- **The run:** Playwright runs in its own container, sharing the web container's network, so the app is at `http://localhost:8080` and the production Secure cookie works. Afterwards the stack and its data are removed.
- **Failures:** traces and screenshots go to `e2e/test-results`, along with the api's log (`stack.log`). The HTML report goes to `e2e/playwright-report` (`pnpm --filter @feedback-portal/e2e exec playwright show-report`).
- **Not part of `pnpm check`:** the first build takes a few minutes.

## Docs

- [Product description](PRODUCT.md)
- [Tech stack](TECH_STACK.md)
- [Data model](DATA_MODEL.md)
- [Roadmap](ROADMAP.md)
- [Workflow & task status](workflow/README.md)
