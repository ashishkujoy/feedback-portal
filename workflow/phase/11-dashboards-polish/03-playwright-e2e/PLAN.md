# 11.3 Playwright E2E — Plan

**Phase:** 11 — Dashboards & polish
**Status:** Done

## Goal
The main path: log in, write feedback, record a conversation, comment

## Done when
- **`pnpm e2e`** builds and starts a separate Compose stack (`e2e/compose.yml`, project `feedback-portal-e2e`), runs the Playwright tests in a container against it, and exits with the tests' result. It then removes the stack and its data.
  - The stack runs:
    - Postgres on tmpfs, fresh on every run;
    - the migrate and seed jobs (the seed makes the E2E admin);
    - the api and web images built from the existing Dockerfiles, so this is the production build behind nginx;
    - a **stand-in Google** (decision 1);
    - Playwright.
  - It publishes **no host ports** and has its own volumes and network, so the dev stack (and its data) is never touched and both can run at once.
- **The main path** runs through the real UI, in one spec:
  1. **Log in.** The admin signs in through "Sign in with Google", the stand-in's sign-in page, and the callback, and lands in the app. The setup runs as that admin (decision 2): a PM, a mentor, a batch run by the PM with the mentor assigned, and an intern.
  2. **Write feedback.** The mentor signs in and opens **My pending**, where the intern is listed. They use **Give feedback**: a markdown body, a colour, then Submit. The row goes, and the feedback is on the intern's timeline.
  3. **Record a conversation.** The PM signs in. **My pending → To deliver** lists the feedback. **Record conversation** with that feedback checked, notes, then Save. The row goes, and the timeline shows the conversation and the feedback marked delivered.
  4. **Comment.** The mentor comments on the feedback from the timeline. The PM sees the comment.
  - Also: an email with no account is turned back to `/login` with the sign-in error, and **Sign out** returns to `/login`.
- On failure, the trace, screenshot and HTML report are written to `e2e/test-results` and `e2e/playwright-report` (both already gitignored).
- `pnpm check` passes (lint, format and typecheck cover `e2e/`), and `pnpm e2e` passes twice in a row.

## Decisions
**All accepted as recommended.**

### (1) How the tests sign in
The api uses Google's real endpoints, which a test can't sign in to. **Recommended:** two optional api settings, `GOOGLE_AUTHORIZATION_URL` and `GOOGLE_TOKEN_URL`. They default to Google's, and only the E2E stack sets them. They point at a small **stand-in Google** (`e2e/fake-google/`, plain Node with no dependencies):
- `GET /authorize` shows a page with an email field and "Continue". It then redirects to the callback with a code and the same `state`.
- `POST /token` checks the client credentials, the redirect URI and the **PKCE** verifier. It returns an ID token for that email (issuer `https://accounts.google.com`, our client id as audience, `email_verified: true`).

The api's code path is unchanged: the state and verifier cookies, the token exchange, the claim checks, the user lookup and the session cookie are all exercised.
- **The cost:** two settings that could, if misconfigured, point sign-in elsewhere. They're documented as for tests only, and the api logs a warning at start-up when either is set.
- **The alternative:** insert a session row and set the cookie, which skips "log in" entirely.

### (2) Setting up the batch
**Recommended:** after signing in through the UI, the admin's setup goes through the **api** (`page.request`, which shares the cookie): create the users, the batch, the mentor's assignment and the intern. Those screens already have their own tests, and the main path stays short and steady. The alternative is clicking through Users, Create batch, Assign mentors and Add intern, which is slower and fails for reasons that aren't the main path.

### (3) Running it
**Recommended:** `pnpm e2e`, separate from `pnpm check`. It needs Docker and about a minute to build, while `check` stays fast and Docker-free. Chromium only. One worker, as the steps depend on each other.

### (4) The browser's address
With `NODE_ENV=production` the session cookie is `__Host-session` (Secure). Chromium keeps Secure cookies over plain http only on `localhost`. **Recommended:** the Playwright container shares the web container's network (`network_mode: service:web`), so the tests open **`http://localhost:8080`**, as a person would open the deployed app. `WEB_APP_URL` and the redirect URI match it. This keeps production cookie settings rather than turning them off for tests.

### (5) Telemetry
**Recommended:** none in the E2E stack. The api gets no OTLP endpoint, and web is built without browser tracing. nginx still names `otel-lgtm` in its `/otlp` proxy and needs it to resolve when it starts, so the stand-in answers to that name too and never receives anything. Grafana's image would add a large pull and start-up for nothing the tests check.

## Plan
- **API:**
  - `config.ts`: the optional `GOOGLE_AUTHORIZATION_URL` / `GOOGLE_TOKEN_URL` (URLs, defaulting to Google's).
  - `google-oauth.ts` uses them.
  - `main.ts` warns when they differ from Google's.
  - Unit tests: the defaults and the overrides; that `start()` and `exchange()` use them.
  - `.env.example`: the two settings, commented as tests only.
- **`e2e/`:** a workspace package `@feedback-portal/e2e` (added to `pnpm-workspace.yaml`), containing:
  - `package.json` with `@playwright/test`, pinned to a release more than a day old;
  - `playwright.config.ts`: baseURL `http://localhost:8080`, Chromium, one worker, a trace on the first retry, no retries locally;
  - `tests/main-path.spec.ts` and small helpers: `signIn(page, email)`, and the api setup;
  - `fake-google/server.ts` (Node, type-stripped, with no dependencies) and its Dockerfile;
  - `Dockerfile` (the Playwright image matching the version, with pnpm installing just this package);
  - `compose.yml`: postgres (tmpfs), migrate, seed (`BOOTSTRAP_ADMIN_EMAIL=admin@e2e.test`), api, web, fake-google, and playwright. Branding uses neutral `PROGRAM_NAME` / `ORG_NAME` values set in the file.
- **Root:**
  - `package.json` gets `"e2e"`, which runs `docker compose -f e2e/compose.yml up --build --abort-on-container-exit --exit-code-from playwright`, then `down -v`.
  - The README gets a short "End-to-end tests" section.

### Tests
- **API unit:** the endpoint settings (defaults, overrides, rejected non-URLs); `start()` builds the URL from the setting; `exchange()` posts to the setting.
- **E2E:** the main path above, plus the unknown-email rejection and sign out.
- **Mutations** (on copies, restored with `cp`, checked with `cmp`):
  - the api ignoring the token setting (the E2E fails at sign-in);
  - Give feedback not refreshing My pending;
  - Record conversation not saving the feedback id;
  - the comment composer not posting;
  - the stand-in skipping the PKCE check (the token test fails).

### Out of scope
- CI wiring, other browsers, visual snapshots, and 11.4's production Compose.
- **Mobile** viewports.

### Steps
1. The api endpoint settings, with tests.
2. The stand-in Google, the E2E package, its Dockerfile and Compose file, and `pnpm e2e`.
3. The main-path spec, sign-in rejection and sign out; get it green and steady (two runs in a row).
4. README, `pnpm check`, mutations, `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- `pnpm e2e` exits 0 twice in a row and leaves no `feedback-portal-e2e` containers or volumes.
- The dev stack's data is unchanged: Dhurandhar still has 61 interns.
- The mutations make `pnpm e2e` (or the unit tests) fail.
