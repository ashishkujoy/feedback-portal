# 1.4 Error handling — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/src/problem.ts` (+ test) | `ErrorCode` enum, `FieldIssue`, `ProblemDetails` (status limited to 400–599). Exported from the index. |
| `apps/api/src/shared/errors/app-error.ts` (+ test) | `AppError` (`kind`, `code`, `issues`) and factories `validationFailed`, `unauthenticated`, `forbidden`, `notFound`, `conflict(detail, code?)`. Imports only contract types, nothing from Hono. |
| `apps/api/src/shared/http/app-env.ts` | `AppEnv` with `Variables.requestId` |
| `apps/api/src/shared/http/request-logger.ts` | Also does `c.set('requestId', …)` |
| `apps/api/src/shared/http/problem.ts` | `problemResponse(c, …)`: adds `type: 'about:blank'`, the standard title and `requestId`, and sends `application/problem+json` |
| `apps/api/src/shared/http/error-handler.ts` | `errorHandler`: `AppError` → mapped from its kind with an exhaustive switch; Hono `HTTPException` with a 4xx status → passed through; anything else → 500, logged at `error`. `notFoundHandler` → 404. |
| `apps/api/src/shared/http/validate.ts` | `validate(target, zodSchema)` on top of `hono/validator`. On failure it throws `validationFailed` with path and message only. |
| `apps/api/src/app.ts` | New `createBaseApp()` (middleware, `onError`, `notFound`). `createApp()` = base + routes. Both return `Hono<AppEnv>`. |
| `apps/api/src/app.test.ts` | The 404 test now also checks the problem body |

No new dependencies.

## How to verify
```sh
pnpm check                                         # exit 0 — 45 contracts + 43 api tests
cd apps/api && pnpm dev
curl -i -H 'x-request-id: demo-1' localhost:3000/nope
```

Manual run result:
```
HTTP/1.1 404 Not Found
content-type: application/problem+json
x-request-id: demo-1

{"type":"about:blank","title":"Not Found","status":404,"code":"not_found","detail":"No route for /nope","requestId":"demo-1"}
```

## Tests (`error-handler.test.ts`)
Every case checks the status, `application/problem+json`, that the body parses with `ProblemDetails`, and that `requestId` equals the `x-request-id` header.

| Status | Case |
|---|---|
| 201 | Valid body passes through `validate` and `c.req.valid('json')` |
| 400 | Schema failure: `errors` paths are `['name', 'qty']`, and the submitted sentinel value is absent from the response |
| 400 | Malformed JSON (Hono's `HTTPException`): `validation_failed`, no `errors` |
| 401 / 403 / 404 / 409 | Thrown `AppError`s keep their `detail`, `title` and `code` |
| 404 | Unknown route |
| 500 | `throw new Error('db password=<sentinel>')`: the body is exactly `{type, title, status, code: 'internal', requestId}` and the sentinel is absent. One `error` record is logged with `requestId` and the `Error`. |
| — | Expected 4xx errors are not logged at `error` |

## Decisions & trade-offs
- **`createBaseApp()` is split out of `createApp()`.** Tests mount throwaway routes on the real middleware and handlers, instead of copying the wiring.
- **The 500 log has the full `Error`, including the stack.** That's server-side only. The client gets a generic body, and the `requestId` connects the two.
- **Hono `HTTPException`s with 5xx are treated as unexpected:** logged and returned as a generic 500, same as any other crash. Only 4xx messages are passed through, because those are Hono's generic texts, such as "Malformed JSON in request body".
- **Zod issue messages are passed through as they are.** Zod 4's default messages describe the expected type, not the received value. The sentinel test checks this.
- **`detail` on the unknown-route 404 includes the request path.** That's harmless in a JSON body, and useful when debugging.
- **The status is typed as Hono's `ContentfulStatusCode`.** That avoids a type cast, which the type-aware lint rule `no-unsafe-type-assertion` would flag.

## Deviations from plan
- **Added `createBaseApp()`.** The plan didn't name it, but it's what makes "test app with the real middleware" possible.
- **The "custom code kept" check is in `app-error.test.ts`, using an existing code.** Specific codes like `invalid_status_transition` don't exist yet, because they come with the tasks that need them. The 409 HTTP test uses `conflict`.
