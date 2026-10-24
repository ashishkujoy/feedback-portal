# 8.5 Import UI — Review

## What changed
| File | Notes |
|---|---|
| `apps/web/src/interns/import-dialog.tsx` | **A10, "Import interns from Airtable"**, "Into {batch}. Interns are matched by username: …", with the step indicator (✓ once done, red when the current step failed; an `ol` with `aria-current="step"`).<br>• **Source:** API key (password, `autocomplete="off"`, password-manager opt-outs, "Used for this import only. It isn't stored."); **Base ID and Table ID side by side** (mono, "Starts with “app”." / "Starts with “tbl”."); View name. Checked with the shared `ImportSourceRequest` before anything is sent; Airtable's refusal → "We couldn't connect to Airtable" with the API's sentence, the values kept.<br>• **Preview:** New / Updated / Invalid strip; the invalid rows (Row, Username or "—", every reason on its own line) with the two v2 sentences; **Back** and **Import N interns** (disabled at 0, focus then on Back).<br>• **Importing:** spinner and "Importing N interns" in an `output`; **Close**.<br>• **Result:** "Import completed", "2 added, 1 updated, 2 skipped. Skipped rows weren't changed." and the three rows; **Done** (focused, described by the summary).<br>• **Failed:** "Import failed", the API's sentence (or "The import couldn't be saved.") and "Nothing was saved."; **Back** (to the preview) and **Try again** (same source).<br>**The key lives only in the dialog:** `Dialog` mounts its children only while open, so closing drops it. The roster, batch and batches queries are invalidated by exact key in `useMutation`'s own `onSuccess`, so this happens even when the dialog was closed mid-import. |
| `apps/web/src/api/imports.ts` | `previewImport` and `runImport`, mutations only (no query key holds the source). |
| `apps/web/src/pages/batch-page.tsx`, `interns/roster-panel.tsx` | **Import from Airtable** (outline, `download`) between Add intern and Assign mentors; the managers' empty roster now has v2's sentence, with **Import from Airtable** (primary) then **Add intern**. |
| `packages/contracts/src/intern-import.ts` (+ test) | v2's wording: "Base IDs start with “app”", "Table IDs start with “tbl”" (decision 5). |
| `apps/web/src/test/stub-api.ts` | `problem()` takes an optional `detail`. |
| `design/README.md` | "Import from Airtable (A10) as built in 8.5", and the A2 notes brought up to date. |

## How to verify
```sh
pnpm check     # contracts 72 + web 261 + api 561
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 72 + 261 (+19) + 561. Format and lint clean, with no suppressions or casts. `pnpm-workspace.yaml` unchanged. |
| Web tests (19 new, `pages/import.test.tsx`; the roster's empty-state test updated) | **Who:** the PM and an admin see the button (header order Add intern, Import, Assign mentors, then the empty state's two); a mentor and an archived batch don't. **Source:** the four fields, key focused, password and not saved; an empty form shows the four messages and **sends nothing**; a valid one posts exactly `{ token, baseId, tableId, view }` (trimmed); 422 → the callout with the API's sentence and the values kept; 500 → the general message; **closing and reopening shows an empty form**. **Preview:** the counts, rows, the hint and Import 3 interns focused; Back keeps the values; 0 importable → disabled with focus on Back; no invalid rows → no table. **Import:** posts the same source to `…/imports`, the result's sentence and rows, Done focused; the importing state while the request hangs; **the roster and batch are fetched again**; a 502 → "Import failed …", Back to the preview, Try again posts the same source (3 posts, all identical); a 500 → "The import couldn't be saved." |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:** the dialog's children kept mounted after close (2 tests); the invalidation removed (1); Import sending an empty source instead of the one previewed (2); client validation removed (5). |
| **Browser** (Compose stack, headless Chrome at 1440×900, a **local Airtable stand-in** serving 8.1's made-up fixtures plus two invalid rows, via a scratch Compose override of `AIRTABLE_API_BASE_URL`; **no real key or base**) | **A2-empty:** v2's sentence, Import (primary) and Add intern (outline). **Source:** 560px dialog, key focused, password/off; Base and Table 225px side by side (JetBrains Mono 13px), View 488px below. **Source errors:** the four messages, and **the stand-in received nothing**. **Denied (403):** "We couldn't connect to Airtable · Airtable said: INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND. This key can't read the base.", the key kept. **Preview** (Ishita added by hand first): New 2, Updated 1, Invalid 2 ("Username is required.", "Invalid email address."), Import 3 interns focused. **Importing** (a 4s-per-page stand-in): the spinner and text, step 3 current. **Result:** "2 added, 1 updated, 2 skipped. …"; after Done the roster shows `ishita.rao`, `kabir.nair`, `zoya.ansari` and the tab says 3. **Reopened:** all four fields empty. **Failed (429 on commit):** red step 3, "Airtable said: RATE_LIMIT_REACHED. Airtable is busy; try again in 30 seconds. Nothing was saved.", Try again focused; **Try again** → "0 added, 3 updated, 2 skipped." **The key:** in no API log line (0), no database row (`pg_dump`: 0), not in local/session storage or the URL; the stand-in got it as the Bearer header on all 10 calls. Runs recorded: completed 2/1/2, failed with the reason, completed 0/3/2. **Cleaned up:** test users, sessions, batches, interns and runs deleted (only your account remains; the history trigger still on), the stand-in and Chrome stopped, the API recreated without the override, tokens and screenshots removed. |

## Decisions & trade-offs
- **All five decisions as recommended.**
- **Error messages have no closing full stop** (decision 5's wording otherwise as v2's): every contract message in the app is written that way ("Name is required", "Invalid email address").
- **Two buttons named "Close" while importing:** the dialog's ✕ and v2's footer Close. Both close; it matches the design, but a screen reader hears the name twice.
- **Browsers may still offer to save the key** after Preview: Chrome treats any password field that disappears after a request as a sign-in. `autocomplete="off"` and the 1Password/LastPass opt-outs reduce this; a plain text field with masking would avoid it but isn't what v2 draws.
- **"Updated" counts every match**, as 8.3 decided, so a re-import says "3 updated" even when nothing in Airtable changed.

## Deviations from plan
- **No full stops in the source error messages** (above).
- **The Done button is described by the result** (as A14's), instead of the result being a live region.

## Not done / follow-ups
- **The Imports tab (A25)** and "View import history" (a new task, not on the roadmap yet).
- **Strip NUL characters** from Airtable values (8.4's follow-up).
- **A check against your real Airtable** (your column names may need a one-line change in `airtable-mapping.ts`).
