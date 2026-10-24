# 8.1 Airtable adapter — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/intern/application/airtable-source.ts` | **The `AirtableSource` port:** `fetchRecords({ token, baseId, tableId, view })` → `AirtableRecord[]` (`{ id, createdTime, fields }`). **`AirtableError`** has a `reason` (`unauthorized`, `forbidden`, `not_found`, `view_not_found`, `rate_limited`, `too_many_records`, `timeout`, `unexpected`), plus Airtable's own `airtableType` and `airtableMessage` when given. It never carries the token or a field's value. |
| `intern/infrastructure/airtable-rest-source.ts` | **The REST adapter:**<br>• **checks the input first** (an empty token, a base not `app…`, a table not `tbl…`, a view empty or over 200 characters → `validation_failed` with field paths, and **no request**);<br>• `GET {apiBase}/v0/{base}/{table}?pageSize=100&view=…` with `Authorization: Bearer`, a **15-second timeout** per request, **following `offset` page after page** (recursion, so there are no suppressed lint rules);<br>• **each page validated with Zod** (`rec…` ids, ISO `createdTime`, `fields` as an object);<br>• Airtable's error body read in both forms (`{ error: { type, message } }` and `{ error: "NOT_FOUND" }`), and 422 `VIEW_NAME_NOT_FOUND` → `view_not_found`;<br>• **at most 2,000 records**; no retries (a 429 says "try again in 30 seconds");<br>• a malformed page reports **only the path** (for example `page 1: records.0.id`), never a value. |
| `shared/config/config.ts` (+ test) | `AIRTABLE_API_BASE_URL` (default `https://api.airtable.com`), for tests and stand-ins only. **No token in config** (your decision: it's typed in per import). |
| `apps/api/test/fixtures/airtable/` | **Recorded responses in Airtable's format, with made-up interns:** two pages (the first with an `offset`), an empty view, a malformed answer (a record without `id`), and the error bodies for 401, 403, 404 and 422, plus a README saying where they come from. Field names look like a recruitment table (Username, Full name, Email, Phone, Diploma branch, Parents' names, Interview notes, and an extra "Interview score"). |
| `workflow/phase/08-airtable-import/01-airtable-adapter/PLAN.md` | Your decisions: **a Base ID field in the dialog** (8.5) and **the API key typed per import, never stored** (TECH_STACK is corrected in 8.3). |

## How to verify
```sh
pnpm check     # contracts 69 + web 242 + api 523
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 69 + 242 + 523 (+11). Format and lint clean, with **no suppressions**. |
| Adapter (11, a fake `fetch` serving the fixtures) | **Both pages read in order:** `Ishita.Rao`, `zoya.ansari`, `kabir.nair`, with the raw fields kept (the extra "Interview score": 8). The same path both times, `pageSize=100`, the view, **the second request carrying the first page's `offset`**, and the bearer header. **An empty view → `[]`.** **Bad input** gives `token`, `baseId`, `tableId` and `view` issues, **with no request made**. **401, 403, 404 (string form) and 422** → `unauthorized`, `forbidden`, `not_found`, `view_not_found`, each with Airtable's type (`AUTHENTICATION_REQUIRED`, `INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND`, `NOT_FOUND`, `VIEW_NAME_NOT_FOUND`), and **the token appears nowhere** in the error. **429** → "Airtable is busy; try again in 30 seconds"; 503 and a network failure → `unexpected`; **a request that hangs past the timeout → `timeout`**. **Over the limit → `too_many_records`.** **The malformed page → `unexpected` naming `page 1: records.0.id`, without the name it contained.** |
| **Mutations** (on a copy, restored with `cp`, checked with `cmp`) | **4, all caught:** `offset` not followed (2 tests); the page not validated; the token put into an error message (5 tests); the record limit removed. |
| Browser | **None:** nothing is visible until 8.5. |

## Decisions & trade-offs
- **Everything is passed per call,** so your two decisions (a Base ID field; the key typed per import) need no change here.
- **No retries.** Airtable asks clients to wait 30 seconds after a 429; for an import someone is watching, saying so is clearer than a long silent wait.
- **The fixtures are hand-made in Airtable's documented format,** not captured from a live call. No real Airtable account or data was used.
- **2,000 records** is a safety cap well above a batch (about 70). It's a parameter if a real case needs more.

## Deviations from plan
- **Pagination is recursive** rather than a loop. A loop needs `await` inside it, which the linter forbids; I first wrote it with suppression comments, then replaced it before running any checks, since suppressions aren't allowed.

## Not done / follow-ups
- **8.2:** map the fields to an intern, with per-row validation, and keep the raw record in `airtable_fields`.
- **8.3:** the preview API, which first receives the key (and **TECH_STACK's "Airtable token in `.env`" is dropped** then).
