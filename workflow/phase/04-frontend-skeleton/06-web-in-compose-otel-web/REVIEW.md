# 4.6 Web in Compose + OTel web — Review

## What changed
| File | Notes |
|---|---|
| `apps/web/Dockerfile` | **Decision 1A.** **build** (the API's Node image and pnpm): `pnpm install --filter @feedback-portal/web...`, then `vite build`, with `VITE_OTEL_TRACES_URL` as a build arg. **runtime:** `nginxinc/nginx-unprivileged:1.31.7-alpine3.24` (uid 101, port 8080) with only `dist/` and the config, plus a `/healthz` health check. |
| `apps/web/Dockerfile.dockerignore` | An allow-list for this Dockerfile only. BuildKit uses it in place of the root `.dockerignore`, so the API image's context is unchanged. Tests, `src/test/` and `test-setup.ts` are excluded. |
| `apps/web/nginx.conf` | **`/api/` → `http://api:3000/`**: the prefix is stripped, and the browser's `Host` and `Origin` are kept. **`/otlp/` → `http://otel-lgtm:4318/`** (decision 2A), 1 MB body limit. `/assets/` is `immutable` for a year. Client routes fall back to `index.html` (`no-cache`). **A missing file with an extension is a 404**, not the app's HTML. `server_tokens off`. |
| `docker-compose.yml` | **New `web` service** on **`5173:8080`**, built with `VITE_OTEL_TRACES_URL=/otlp/v1/traces`. It starts after the API is healthy, and has its own health check. The header comment is updated. |
| `apps/web/src/telemetry/telemetry.ts` (+ test), `load-telemetry.ts` | **`startTelemetry`**: a `WebTracerProvider` (`service.name = feedback-portal-web`), a `BatchSpanProcessor` with the OTLP/HTTP exporter, and the W3C propagator. `FetchInstrumentation` ignores `/otlp/`, and `traceparent` goes on same-origin requests only (the default). **`loadTelemetry(url)`** does nothing without a URL; otherwise it `import()`s the SDK as a separate chunk. |
| `apps/web/src/main.tsx`, `vite-env.d.ts` | `await loadTelemetry(import.meta.env.VITE_OTEL_TRACES_URL)` before the app is created, so `/settings` and `/me` are traced too. The env var is typed. |
| `apps/web/vite.config.ts` | The `/otlp` proxy to `localhost:4318`, for `pnpm dev:web` with tracing turned on |
| `apps/web/package.json` | `@opentelemetry/{api 1.9.1, sdk-trace-web 2.12.0, instrumentation-fetch 0.223.0, exporter-trace-otlp-http 0.223.0, instrumentation 0.223.0, resources 2.12.0, semantic-conventions 1.43.0}`, the API's release line. **`pnpm-workspace.yaml` is unchanged** (checked with `diff`). |
| `apps/web/src/test/stub-api.ts` | It matches on the URL's **pathname**, because the fetch instrumentation passes a `Request` with an absolute URL |
| `README.md`, `TECH_STACK.md` | The Docker section covers the web app at :5173, one-or-the-other for both ports, **Chrome or Firefox for Compose sign-in**, rebuilding for UI changes, browser traces in Tempo, and `VITE_OTEL_TRACES_URL` for `pnpm dev:web`. TECH_STACK's Compose `web` row and Telemetry row are updated. |

## How to verify
```sh
pnpm check                              # contracts 54 + web 52 + api 295
docker compose up -d --build --wait     # everything, including web
open http://localhost:5173
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 54 + **52** + 295 (web +3). |
| Telemetry tests | A same-origin `fetch('/api/me')` carries a valid `traceparent`, whose trace ID matches the recorded **client** span. The span has `service.name` `feedback-portal-web`, `http.request.method` GET and `http.response.status_code` 200. A POST to `/otlp/v1/traces` gets no header and no span. **Without a URL, `fetch` is left untouched.** |
| Compose | **All four services healthy** from `docker compose up -d --build --wait`. nginx runs as uid 101. |
| nginx (curl on :5173) | `/`, `/batches` and `/login?error=unavailable` give 200 `index.html` with `no-cache`. A hashed asset gives `public, max-age=31536000, immutable`. `/assets/nope.js` and `/favicon.ico` give 404. `/api/health` gives 200. `/api/me` gives 401 problem+json. **`/api/auth/google` gives 302 to `accounts.google.com`** (your client is configured). |
| CSRF through nginx | A bodyless `POST /api/auth/logout` with `Origin: http://evil.test` gives **403**; with `Origin: http://localhost:5173`, **204**. The `Origin` header reaches the API unchanged. |
| **Real browser → API** | **Headless Chrome** (a throwaway profile, deleted afterwards) loaded `/login` from the container. It rendered the sign-in card, and the title was "\<Program\> · Mentor portal". It loaded the `telemetry-*.js` chunk and posted OTLP twice (200). **In Tempo,** trace `056e36…` is web `GET http://localhost:5173/api/settings` → API `GET /settings` (parent = the browser span), and trace `e480f1…` is web `GET …/api/me` 401 → API `GET /me`. |
| **Browser → API → DB** | The signed-out pages make no database query, so for the database leg I sent `GET /api/health/ready` through nginx with a generated `traceparent`, and posted the matching web span to `/otlp/v1/traces`. Tempo shows **one trace**: `feedback-portal-web HTTP GET` → `GET /health/ready` → `pg-pool.connect`, `pg.connect` and `pg.query`. The real-browser traces show the web → API link, and this one shows the API → DB link in the same trace. |
| Bundle | A build without the URL (`pnpm build:web`) has **no SDK code in the main chunk**. The SDK sits in a separate `telemetry-*.js`, which isn't loaded. |
| **Not done: signing in with Google through Compose** | That needs you to pick the account. In Chrome, open http://localhost:5173 with no `pnpm dev` or `pnpm dev:web` running. After sign-in, Tempo should show `/me` traces with `pg` spans under them. |
| Not done: Chrome extension | It's still not connected, so I used headless Chrome from the CLI instead of the extension, and didn't take a visual screenshot. |

## Decisions & trade-offs
- **Decisions taken: 1A** (nginx with the production build) **and 2A** (`/otlp` through the web origin).
- **`Host` is passed through** (`$http_host`), so the API sees `localhost:5173` as Vite's `changeOrigin: false` does. `X-Forwarded-For` is not added or trusted (11.x).
- **The OTel web packages are on the API's release line** rather than the new 3.0 / 0.300 line (2 days old). Upgrading both together is a follow-up.
- **The SDK is a lazy chunk.** The `import()` is still in the main bundle, but only the Compose build, which sets the URL, ever loads it.
- **`await` at the top of `main.tsx`.** The first render waits for the SDK chunk when tracing is on, so the first `/settings` and `/me` requests are traced. That's one small extra request, and nothing when tracing is off.
- **Telemetry isn't in the web unit tests for the whole app.** `renderApp` doesn't start it. Only `telemetry.test.ts` covers it, to keep the global tracer out of other tests.

## Deviations from plan
- **A missing file with an extension gives 404** (added): without it, `/favicon.ico` was served the app's HTML with 200.
- **`stubApi` matches on the pathname** (added), for the fetch instrumentation's `Request` objects.
- **The browser → API → DB check was split across two traces' worth of evidence,** as described above. The plan expected one browser page load to cover all three.

## Not done / follow-ups
- **Your Google sign-in through Compose in Chrome.** Safari won't keep the `Secure` cookie on http://localhost.
- **11.x:** limit or turn off `/otlp` in production (size, rate, sampling); decide whether to trust browser-supplied `traceparent`; TLS, security headers and CSP (including `img-src` for Google avatars); trusted `X-Forwarded-For`.
- **Upgrade OpenTelemetry to 3.0 / 0.300** in the API and web app together.
