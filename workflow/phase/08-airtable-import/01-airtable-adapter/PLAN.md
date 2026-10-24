# 8.1 Airtable adapter — Plan

**Phase:** 8 — Airtable import
**Status:** Done

## Goal
Fetch records from a base, table, and view, and validate them with Zod

## Done when
- **An `AirtableSource` port** in the intern module, and **an adapter** that fetches *every* record of a table's view through Airtable's REST API (`GET /v0/{base}/{table}?view=…`, following `offset` pages). It **validates each response with Zod** before anything else sees it.
- **Airtable's failures become clear errors:** a bad token, no permission, an unknown base, table or view, rate limiting, a timeout, or an unexpected answer. Each keeps **Airtable's own error type** (v2's A10-sourceerrors shows "Airtable said: INVALID_PERMISSIONS…").
- **Tests use recorded fixtures:** JSON files in Airtable's response format, with made-up records. `pnpm check` passes.
- **No HTTP route or UI yet** (8.3 to 8.5), and nothing is written to the database.

## The adapter
- **Input:** `{ token, baseId, tableId, view }`. **Everything comes per call,** so 8.3 can decide where each value comes from (see below) without changing the adapter.
- **Checked before calling Airtable:**
  - `baseId` `^app[A-Za-z0-9]{14}$`;
  - `tableId` `^tbl[A-Za-z0-9]{14}$` (v2: "Starts with 'tbl'");
  - `view` either a view id (`viw…`) or a name, 1–200 characters;
  - the token never empty.
- **Request:** `Authorization: Bearer <token>`, `pageSize=100` and `view=<view>`, each request with a 15-second timeout. **The token is never logged** or put in an error message.
- **Response validation (Zod):** `{ records: [{ id: /^rec…/, createdTime: ISO, fields: Record<string, unknown> }], offset?: string }`. Checking each field's meaning is **8.2's** mapping; 8.1 only guarantees the shape.
- **Limits:**
  - at most **2,000 records** (20 pages); a bigger view is refused with a clear message, since a batch has about 70;
  - **no automatic retries.** A 429 says "Airtable is busy; try again in 30 seconds", per Airtable's rule.
- **Errors** are one `AirtableError` with a `reason`:

| Reason | When |
|---|---|
| `unauthorized` | 401 |
| `forbidden` | 403, for example `INVALID_PERMISSIONS` |
| `not_found` | 404: the base or table |
| `view_not_found` | 422 `VIEW_NAME_NOT_FOUND` |
| `rate_limited` | 429 |
| `too_many_records` | over 2,000 |
| `timeout` | no answer in 15 seconds |
| `unexpected` | 5xx, a network failure, or an answer that doesn't parse |

  Each also carries Airtable's `error.type` and `error.message` when Airtable gave them.
- **Config:** `AIRTABLE_API_BASE_URL` (default `https://api.airtable.com`), only for tests and stand-ins, like 7.7's.

## Decided for the import (you, 2026-10-24)
v2's A10 asks for **API key**, **Table ID** and **View name**, but has no base ID, which Airtable's API needs.
1. **A Base ID field is added to the dialog** (8.5), next to Table ID. This differs from v2 and is recorded in design/README when 8.5 builds it.
2. **People type the API key for each import, and it's never stored,** as v2 shows ("Used for this import only. It isn't stored."). **TECH_STACK's "Airtable token" in `.env` is dropped** (updated in 8.3, which first receives the key).

**The adapter is unchanged by either:** it takes the token, base, table and view on every call.

## Plan
- **`intern/application/airtable-source.ts`:** the port, `AirtableSourceInput`, `AirtableRecord` (`{ id, createdTime, fields }`) and `AirtableError` (with the reasons above).
- **`intern/infrastructure/airtable-rest-source.ts`:** the adapter, with an injectable `fetch` and base URL, Zod schemas for the page and for Airtable's error body, pagination, and the limits and mapping above.
- **`shared/config`:** `AIRTABLE_API_BASE_URL`.
- **`apps/api/test/fixtures/airtable/`:** recorded responses with made-up interns and neutral field names that look like a recruitment table (Username, Full name, Email, Phone, Diploma branch, Parents' names, Interview notes):
  - two pages, the first with an `offset`;
  - an empty view;
  - a malformed answer (a record without `id`);
  - Airtable's error bodies for 401, 403, 404 and 422 `VIEW_NAME_NOT_FOUND`.

  They follow Airtable's documented format, since no real Airtable call is made.

### Tests (unit, with a fake `fetch` serving the fixtures)
- **Requests:** the URL, the `view` and `pageSize` parameters and the bearer header.
- **Pagination:** two pages are read in order, the second asked for with the first's `offset`, and the records are joined.
- **An empty view** gives `[]`.
- **The input is checked:** a malformed base, table or view, or an empty token, is refused **with no request made**.
- **Each error reason** comes from its fixture or condition, keeps Airtable's type and message, and **never shows the token**. The 2,001st record → `too_many_records`; a hanging response → `timeout`, using a fake clock or a tiny timeout.
- **A malformed page → `unexpected`**, saying which record failed, without echoing field values (they're personal data).
- **Mutations** (on copies, restored with `cp`):
  - the `offset` not followed;
  - the response not validated;
  - the token included in an error;
  - the record limit removed.

  Each must fail a test.

### Out of scope
- **Mapping fields to an intern and per-row validation** (8.2).
- **Preview, commit, `airtable_imports`** (8.3, 8.4), and **the UI** (8.5).
- **Linked records, attachments and lookups** in Airtable. They stay raw in `airtable_fields` (8.2).

### Steps
1. Config, the port and error types, and the fixtures.
2. The adapter, test-first.
3. Run `pnpm check` and the mutations, and write `REVIEW.md`. **There's no browser check:** nothing is visible yet.

### Verification
- `pnpm check` exits 0.
- The mutations fail tests.
