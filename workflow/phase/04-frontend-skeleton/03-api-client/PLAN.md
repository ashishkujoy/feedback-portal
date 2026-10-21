# 4.3 API client — Plan

**Phase:** 4 — Frontend skeleton
**Status:** Done

## Goal
Typed fetch that validates responses with the contracts and sends cookies; Vite proxies `/api` to the api

## Done when
- **The web app calls the API only through `/api` on its own origin.** In dev, Vite proxies `/api` to `http://localhost:3000`.
- **One typed client, `apiFetch`, handles every call.** It parses each success with a contract schema and turns each failure into an `ApiError` built from the API's problem+json.
- **`/me` loads:** with a session cookie, the shell shows the signed-in user at the foot of the sidebar and "Viewing as \<role\>" in the top bar. Without one, it shows neither and nothing breaks.
- Unit tests cover the client and the shell's `/me` states. `pnpm check` passes.

## Plan

### Decision needed: does `/api` reach the API?
The browser calls `/api/...` on the web origin. In production one host serves both (nginx in 4.6). The question is whether the API's own routes include `/api`.

| Option | What it means |
|---|---|
| **A. The proxy strips `/api`; the API stays at `/`** *(recommended)* | Vite uses `rewrite: p => p.replace(/^\/api/, '')`, and nginx in 4.6 uses `location /api/ { proxy_pass http://api:3000/; }`. **No API code or test changes**, and probes and traces keep their current paths (`/health`, `GET /me`). The one wrinkle: 3.8's `Location: /users/:id` header is relative to the API root. The web app never follows it, and the header can be dropped if it confuses anyone. |
| B. Mount the API under `/api` (`basePath('/api')`) | The paths are the same everywhere, with no rewrite. But it touches about 40 route-test paths, the Compose and Dockerfile health checks, the liveness skip in logging and telemetry, and the README. That's churn for no change in behaviour. |

The rest of the plan assumes **A**.

### Cookies through the proxy
- **The browser only ever talks to the web origin**, so the session cookie belongs to that origin. `credentials: 'same-origin'` (the default, set explicitly) sends it.
- **The proxy keeps the browser's `Origin` header** (`changeOrigin: false`), so the API's `csrf()` check against `WEB_APP_URL` still sees `http://localhost:5173`.
- **Google sign-in will go through the proxy too** (`GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/google/callback`), so the session cookie is set on the web origin. That's wired and documented in 4.4; nothing about it changes here.

### The client (`apps/web/src/api/`)
```ts
apiFetch(path, { schema, method = 'GET', body, signal })   // → z.output<schema>, or undefined without a schema (204)
```
- **`path`** is an API path such as `/me`. The client adds the `/api` prefix.
- **`body`** is JSON-encoded, with `content-type: application/json`. A bodyless POST (logout, deactivate) sends no content type.
- **Success:** `schema.parse(json)`. A mismatch throws **`ApiContractError`**, a bug between the web app and the API, with the Zod issues attached for the console. It's never shown to users as a "validation" message.
- **Failure:** the body is parsed as **`ProblemDetails`** (`@feedback-portal/contracts`), and **`ApiError`** is thrown with `{ status, code, detail, errors, requestId }`.
  - A body that isn't problem+json, such as an HTML 502 from a proxy, becomes `ApiError` with `status` and code `internal`.
  - A failed request (API down, offline) becomes `ApiError` with status 0 and code `unavailable`.
  - Callers switch on `code`, never on text.
- **`isApiError(error, code?)`** is a small type guard for components and the retry policy.
- No auth headers or tokens: the cookie is the session.

### Query wiring
- **Retry policy** (in `createQueryClient`): **don't retry 4xx `ApiError`s** (401, 403, 404 and 409 won't change by retrying). Retry once on 5xx, `unavailable` and contract errors.
- **`meQuery`** (`api/me.ts`): `queryOptions({ queryKey: ['me'], queryFn })`.
  - **A 401 resolves to `null`** ("signed out") instead of an error, so 4.4's route guard can branch on it.
  - `staleTime` is 5 minutes. Logout and sign-in (4.4) invalidate it.

### The shell (`/me` shown, as the design draws it)
- **The sidebar user block** (from 4.2's measurements):
  - `margin-top:auto`, padding 12px 8px, a 1px top border at 14% white.
  - A **28px Avatar**: the Google `avatarUrl` image if there is one, otherwise initials on `ee-blue-100` with `ee-blue-700` text, 40% size and weight 600, as the Kuat Avatar does.
  - The **name** at 13px/500 in white, and the **role label** at 12px in `tech-blue-100`.
- **The top bar right side:** "Viewing as" at 13px in `--muted-foreground`, plus the **Kuat Tag** in `base` colour (pill, 8px 10px padding, `text-sm` weight 500, 21px line height).
- **Which role to show:** the design shows one role per user, but a user can hold several. The shell shows the **most privileged**: Admin, then Programme manager, then Mentor. The labels use the design's spelling, "Programme manager". A role switcher isn't in the design.
- **While loading, or signed out:** neither block is rendered. There are no spinners, because the design shows none. 4.4 redirects signed-out users to sign-in.
- **New UI pieces:** `ui/avatar.tsx` and `ui/tag.tsx` (display mode only; toggle and dismiss come with filters), written in-repo to Kuat's specs.

### Tests
- **`apiFetch`** (unit, with a stubbed `fetch`):
  - it adds `/api` and `credentials: 'same-origin'`;
  - JSON bodies get the content type, and bodyless requests get none;
  - a success is parsed;
  - a contract mismatch gives `ApiContractError`;
  - problem+json gives `ApiError` with every field;
  - an HTML 502 gives `internal`;
  - a network failure gives `unavailable`;
  - a 204 gives `undefined`;
  - `signal` is passed through.
- **The retry policy:** a 401 isn't retried, and a 503 is retried once.
- **`meQuery`:** 200 gives the user, 401 gives `null`, and 500 gives an error.
- **The shell** (with the router and a stubbed `/api/me`):
  - **Signed in, admin and mentor:** the avatar shows initials, or the image when `avatarUrl` is set. The name and role label are shown, and the top bar reads "Viewing as Admin". A user with `['mentor', 'program_manager']` reads "Programme manager".
  - **Signed out (401):** no user block and no "Viewing as". The pages still render.
- **The proxy** is checked by hand (below), since it's dev-server configuration.

### Docs
- **README "Web app":** the `/api` proxy, and that `pnpm dev` for the API plus `pnpm dev:web` gives the full app on http://localhost:5173.
- **TECH_STACK:** the API client row gets the error model (`ApiError` codes, `ApiContractError`) and "same origin through `/api`".

### Out of scope
- **The sign-in page, route guard, logout and role-based navigation:** 4.4. That includes hiding Users and roles from non-admins and showing "My batches" for mentors.
- **`GET /settings`:** 4.5. **nginx and Compose for the web app:** 4.6.
- **Mutations helpers and toasts:** they come with the first form (Phase 5).

### Steps
1. Add the Vite proxy, then `apiFetch`, `ApiError`, `ApiContractError` and `isApiError`, with tests.
2. Add the retry policy and `meQuery`, with tests.
3. Add Avatar and Tag, and the shell's user block and "Viewing as", with tests.
4. Docs. Run `pnpm check`, do the manual check below, and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- **By hand:** run the API (`pnpm --filter @feedback-portal/api dev`, Postgres from Compose) and `pnpm dev:web`.
  - `curl -i localhost:5173/api/health` gives 200 from the API.
  - `curl -i localhost:5173/api/me` gives 401 problem+json.
  - With a user and session inserted into the DB and the `session` cookie set in the browser for `localhost`, http://localhost:5173 shows the user block and "Viewing as …".
  - A bodyless POST to `/api/auth/logout` from the page passes the CSRF check and returns 204; reloading then shows the signed-out shell.
  - The test user is deleted afterwards.
