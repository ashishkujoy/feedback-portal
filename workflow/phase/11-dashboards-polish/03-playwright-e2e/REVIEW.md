# 11.3 Playwright E2E — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/shared/config/config.ts` | Two optional settings, **`GOOGLE_AUTHORIZATION_URL`** and **`GOOGLE_TOKEN_URL`** (http(s) URLs). They default to Google's endpoints (exported as `googleEndpoints`) and are carried in `GoogleConfig`. |
| `identity/infrastructure/google-oauth.ts` | `start()` and `exchange()` use the configured endpoints. Nothing else changed: state, PKCE and the claim checks are as before. |
| `apps/api/src/main.ts` | Warns at start-up when either endpoint isn't Google's: "Google sign-in uses a stand-in … tests only". |
| `apps/api/.env.example` | The two settings, commented as end-to-end tests only. |
| `config.test.ts`, `google-oauth.test.ts` | The defaults, a stand-in's URLs, rejected non-http URLs; the adapter sends the browser to, and posts the code to, the stand-in. |
| `e2e/fake-google/server.ts` | **The stand-in Google**: plain Node with no dependencies. `GET /authorize` is a page with Email and Continue. `POST /authorize` checks the client, the redirect URI and S256, then redirects with a one-use code and the same `state`. `POST /token` checks the Basic client credentials (form-encoded, as the api sends them), the code, the redirect URI and the **PKCE verifier**. It returns an unsigned ID token (`iss` Google, `aud` the client, `email_verified`). |
| `e2e/compose.yml` | Project **`feedback-portal-e2e`**: postgres on tmpfs, migrate, seed (`admin@e2e.test`), the api, the web (the production nginx build, without browser tracing), fake-google and playwright. There are **no host ports**. Playwright runs with `network_mode: service:web`. |
| `e2e/run.sh`, root `package.json` | **`pnpm e2e`**: `build`, `up --detach --wait web`, `run --rm playwright`. On failure it saves the api and stand-in logs to `e2e/test-results/stack.log`. It always runs `down --volumes --remove-orphans` and exits with Playwright's status. |
| `e2e/Dockerfile` (+ `.dockerignore`) | `mcr.microsoft.com/playwright:v1.64.1-noble` (Node 24, browsers that match the package), with pnpm installing only `@feedback-portal/e2e`. |
| `e2e/package.json`, `tsconfig.json`, `playwright.config.ts`, `pnpm-workspace.yaml` | The workspace package (`@playwright/test` 1.64.1, released 14 Oct). Chromium, one worker, serial, `forbidOnly`; on failure it keeps the trace and a screenshot, and writes the HTML report. It is typechecked and linted by `pnpm check`. |
| `e2e/tests/sign-in.ts`, `setup.ts`, `main-path.spec.ts` | `signIn` goes through the login page and the stand-in's page. The admin's setup goes through the api. The spec covers the main path. |
| `README.md` | `pnpm e2e` in the test table, plus an "End-to-end tests" section. |

## How to verify
```sh
pnpm check   # contracts 84 + web 426 + api 719
pnpm e2e     # needs Docker; about 45s once the images are cached
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** API 719 (+3). Format and lint are clean (`e2e/` included), with no suppressions. The only new dependency is `@playwright/test` 1.64.1, and there is no `minimumReleaseAgeExclude`. |
| `pnpm e2e` | **6 passed, twice in a row** (9.1s and 9.2s of tests; the second run took 46s in total). Afterwards no `feedback-portal-e2e` containers, volumes or network were left. |
| Unknown email | The stand-in's page, then the callback, then `/login?error=sign_in_failed` with "We couldn't sign you in". |
| Admin | Signs in through **Sign in with Google**, the stand-in's page and the callback, and lands on **Batches**. Then, through the api with the browser's cookie and Origin, it adds a PM, a mentor, "Batch E2E" (started last month) with the mentor assigned, and an intern. The batch then shows in the list. |
| Mentor gives feedback | Nav shows **"My pending (1)"**. The intern is in "Interns needing your feedback". **Give feedback to Isha Intern** opens A7: markdown text, **Green**, **Submit feedback**. The dialog closes, "You're up to date" shows, and the nav reads just "My pending". The profile's feedback card shows the rendered text. |
| PM records the conversation | "My pending (1)" opens on **To deliver**. **Record conversation for Isha Intern, feedback by Meera Mentor** opens A8 with that feedback checked. Notes, then **Save conversation**: "No feedback is waiting to be delivered.". The profile shows the conversation and the feedback marked **Delivered**. |
| Comment | The mentor opens **Comment** on the feedback card, types and posts; the composer closes and the comment shows. The **PM**, in a separate browser context, sees it on the profile. |
| Sign out | **Sign out** goes to `/login`, and `/pending` then asks you to sign in. |
| Start-up warning | The api log in the E2E stack shows "Google sign-in uses a stand-in (GOOGLE_AUTHORIZATION_URL / GOOGLE_TOKEN_URL): tests only". |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **5, all caught by `pnpm e2e`**, each failing at the step it breaks. The api ignoring `GOOGLE_TOKEN_URL`, and the api not sending the PKCE verifier (which the stand-in rejects), both fail at the admin's sign-in. Give feedback not refreshing My pending fails at the mentor step. Record conversation not sending the feedback fails at the PM step. The comment composer not posting fails at the comment step. |
| Dev data | The dev stack's database is unchanged: Dhurandhar has 61 interns, and there are no `@e2e.test` users. The E2E stack never connects to it. |

## Decisions & trade-offs
- **All five as recommended:**
  - a stand-in Google behind two test-only api settings;
  - the admin's setup through the api;
  - `pnpm e2e`, separate from `pnpm check`, Chromium only, one worker;
  - the browser on `localhost:8080`, sharing the web container's network, so production cookies stay on;
  - no telemetry, with the stand-in answering to `otel-lgtm` so nginx starts.
- **The ID token is unsigned** (`alg: none`). The api doesn't check signatures: it takes the token straight from the token endpoint, as OIDC allows. The issuer, audience and expiry checks still run.
- **The stand-in checks PKCE and the client credentials,** so a broken sign-in in the api fails the suite instead of passing against a lenient fake.
- **Serial tests that share the batch** across steps, with each test signing in afresh in its own browser context. A failure stops the steps after it, which then read as "did not run".
- **The colour is chosen by clicking its label's text,** as a person does. The radio input sits under the label, so Playwright's `check()` on the input is blocked by the label.

## Deviations from plan
- **`run.sh` instead of `up --exit-code-from playwright`:** that flag implies `--abort-on-container-exit`, which stopped the whole stack as soon as the one-shot migrate job exited. The script waits for web to be healthy, runs Playwright with `compose run`, and always tears down.
- **The fifth mutation is the api not sending the PKCE verifier,** not "the stand-in skipping PKCE". Nothing tests the stand-in itself; this shows that its PKCE check is enforced against the api.
- **Traces are kept on failure** (`retain-on-failure`), since there are no retries for "on first retry" to apply to. The api's log is saved too.
- **The plan called `pnpm check` Docker-free, which was wrong:** its integration tests already use Docker. `pnpm e2e` stays separate because of its image builds, not because it needs Docker.

## Not done / follow-ups
- **CI wiring:** a job only needs Docker and `pnpm e2e`. Other browsers, visual snapshots and mobile viewports are also left out.
- **11.4** (the production Compose) can reuse `e2e/compose.yml`'s pattern. It should decide whether nginx resolves `otel-lgtm` lazily, so the stack starts without a collector.
