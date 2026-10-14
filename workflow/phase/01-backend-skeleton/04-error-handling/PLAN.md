# 1.4 Error handling — Plan

**Phase:** 1 — Backend skeleton
**Status:** Done

## Goal
Domain and application error types mapped to an HTTP problem-JSON shape

## Done when
- Every error response, including unknown routes, bad input, thrown `AppError`s and unexpected crashes, has the same problem-JSON body with `Content-Type: application/problem+json`.
- Tests cover 400, 401, 403, 404, 409, and 500.
- A 500 never leaks the error message or stack to the client. It is logged at `error` with the `requestId`.
- `pnpm check` passes.

## Plan

### Response shape (RFC 9457 problem details), in contracts
```ts
// packages/contracts/src/problem.ts
ProblemDetails = z.object({
  type: z.string(),            // 'about:blank' for now (no per-error doc URLs)
  title: z.string(),           // standard reason phrase, e.g. 'Not Found'
  status: z.number().int(),
  code: ErrorCode,             // stable, machine-readable, e.g. 'not_found'
  detail: z.string().optional(),       // human-readable, safe to show
  requestId: z.string(),       // matches the x-request-id header
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(), // 400 only
});
```
- **`ErrorCode`** is a Zod enum in contracts: `validation_failed`, `unauthenticated`, `forbidden`, `not_found`, `conflict`, `internal`.
  - The web app (4.x) switches on `code`, not on `title` or `detail`.
  - Later tasks can add more specific codes as they need them, for example `invalid_status_transition`.
- **Example:**
  ```json
  { "type": "about:blank", "title": "Forbidden", "status": 403, "code": "forbidden",
    "detail": "You are read-only on this batch", "requestId": "…" }
  ```

### Error types (`apps/api/src/shared/errors/`), framework-free
The domain layer must not import Hono, so error types live here and the HTTP mapping lives in `shared/http`.

```ts
type ErrorKind = 'validation' | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict';

class AppError extends Error {   // class only for instanceof, as with ConfigError
  readonly kind: ErrorKind;
  readonly code: ErrorCode;      // defaults to the kind's code; overridable for specific codes
  readonly issues?: readonly { path: string; message: string }[];
}

// arrow factories for call sites:
notFound(detail), forbidden(detail), conflict(detail, code?), unauthenticated(detail?),
validationFailed(issues)
```
- **Domain invariant violations map to `conflict` (409).** An example is an illegal status transition, which conflicts with the resource's current state.
  - I chose 409 over 422 to keep the mapping small. A specific `code` tells the cases apart.
- **No separate `DomainError`/`ApplicationError` hierarchy yet.** The `kind` field carries the meaning, and the HTTP layer maps it with an exhaustive `switch`, which the lint rule enforces.

### HTTP mapping (`apps/api/src/shared/http/`)
| Source | Status | `code` |
|---|---|---|
| `AppError` | from `kind`: 400 / 401 / 403 / 404 / 409 | `error.code` |
| No route matched (`app.notFound`) | 404 | `not_found` |
| Hono `HTTPException` (e.g. from built-in middleware later) | its status | from status, else `internal` |
| Anything else | 500 | `internal`, `detail` omitted |

**Files:**
- **`problem.ts`:** `problemResponse(c, problem)` sets the status and `application/problem+json`.
- **`error-handler.ts`:** the `onError` and `notFound` handlers.
  - For 5xx it logs `logger.error('unhandled error', { error })` under `['api', 'http']`, with `requestId` and the stack.
  - 4xx responses are not logged separately; the request log line already shows the status.
- **`validate.ts`:** `validate(target, schema)`.
  - It's a thin wrapper over Hono's built-in `hono/validator` that runs a Zod schema and throws `validationFailed(issues)` on failure.
  - `issues` contains only the field path and message, never the received value.
  - Malformed JSON gives a 400 with `validation_failed`.
  - I wrote our own instead of adding `@hono/zod-validator`, to keep dependencies light.

### Request ID in the body
- The request logger also stores the ID with `c.set('requestId', id)`, so the error handler can include it.
- An `AppEnv` type (`{ Variables: { requestId: string } }`) is added, and `createApp()` returns `Hono<AppEnv>`.

### Tests
**`error-handler.test.ts`** uses a test app with the real middleware and handlers, plus throwaway routes. Every case checks the status, `content-type: application/problem+json`, that the body parses with `ProblemDetails`, and that `requestId` equals the `x-request-id` header.

| Status | Case |
|---|---|
| 400 | Body fails a Zod schema: `errors` lists each field path and message, and the submitted value doesn't appear |
| 400 | Malformed JSON body |
| 401 | `unauthenticated()` thrown |
| 403 | `forbidden('…')` thrown: `detail` is passed through |
| 404 | Unknown route, and `notFound('…')` thrown |
| 409 | `conflict('…', 'some_specific_code')`: the custom code is kept |
| 500 | `throw new Error('db password=…')`: generic body, no `detail`, the message is absent from the body, and one `error` record is logged with `requestId` and the error |

**`errors.test.ts`:** each factory sets the right `kind` and default `code`.

**`app.test.ts`:** the existing 404 test also checks the problem body.

### Out of scope
- **Per-error documentation URLs in `type`.** It stays `about:blank`.
- **Validating response bodies** (output validation). It can be added when the first real route arrives.
- **Unhandled rejections and `uncaughtException` at process level.** They come with OTel and LGTM (2.2), when crash reporting has somewhere to go.
- **Rate limiting (429), body-size limits (413), and CSRF.** These are decided with auth (3.x).

### Steps
1. Add `ErrorCode` and `ProblemDetails` to contracts, with tests.
2. Write `shared/errors` (`AppError` and factories), with tests.
3. Add the `AppEnv` type, and make the request logger set `requestId`.
4. Write `problem.ts`, `error-handler.ts` and `validate.ts`, and wire them into `createApp`.
5. Write the tests in the table above.
6. Manual check: `curl` an unknown route and look at the headers and body.
7. `pnpm check`. Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- `curl -i localhost:3000/nope` returns `404`, `application/problem+json`, and a body whose `requestId` matches the header.
