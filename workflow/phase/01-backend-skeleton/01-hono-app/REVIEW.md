# 1.1 Hono app — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/src/health.ts` (+ test) | `HealthResponse = z.object({ status: z.literal('ok') })`, exported from the package index |
| `apps/api/package.json` | `@feedback-portal/api`. Deps (exact): `hono@4.13.11`, `@hono/node-server@2.1.3`, `@feedback-portal/contracts`. devDeps: `vitest@5.0.2`, `@feedback-portal/tsconfig`. Scripts `dev` (`node --watch`), `start`, `test`, `typecheck`. |
| `apps/api/tsconfig.json` | Extends `node.json` |
| `apps/api/src/app.ts` | `createApp()` mounts `/health`. No I/O and no listening, so it can be tested with `app.request()`. |
| `apps/api/src/shared/http/health.routes.ts` | `GET /` → `{ status: 'ok' }`, typed with `HealthResponse` |
| `apps/api/src/main.ts` | Composition root. `serve()` on port 3000. Graceful shutdown on `SIGINT`/`SIGTERM`: `server.close()` plus `closeIdleConnections()`, with a forced exit after 10 s |
| `apps/api/src/app.test.ts` | Health contract test and 404 test |
| `apps/.gitkeep` | Removed |

No release-age exceptions were added to `pnpm-workspace.yaml`. I checked after installing.

## How to verify
```sh
pnpm check                                    # exit 0 — 41 contracts + 2 api tests
pnpm --filter @feedback-portal/api dev        # "api listening on http://localhost:3000"
curl -i localhost:3000/health                 # 200, application/json, {"status":"ok"}
# Ctrl-C → "SIGINT received, shutting down", exit 0
```

Manual run results:

| Signal | `/health` | Exit code |
|---|---|---|
| `SIGINT` | `200`, `application/json`, `{"status":"ok"}` | 0 |
| `SIGTERM` | same | 0 |

## Decisions & trade-offs
- **`closeIdleConnections()`:** `server.close()` alone waits for idle keep-alive connections to time out, which would stall shutdown. It's guarded with `'closeIdleConnections' in server`, because the server type also covers HTTP/2, which doesn't have that method.
- **Forced-exit timer (10 s), marked `unref()`:** it can't keep the process alive by itself, but it stops a stuck request from blocking a container stop forever.
- **`createApp` is typed as plain `Hono`.** We don't need route-level type inference, because the web app uses contracts plus a typed fetch client, not Hono RPC.
- **Health route as its own sub-app** (`new Hono().get('/')` mounted at `/health`). Each module's routes will follow the same pattern and be mounted in `app.ts`.

## Deviations from plan
- None in scope.
- **Not tested:** that an *in-flight* request finishes during shutdown. That needs a deliberately slow route. The behaviour comes from Node's `server.close()`. Tell me if you want a test for it.
