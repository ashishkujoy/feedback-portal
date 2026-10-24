# 9.4 Markdown components — Review

## What changed
| File | Notes |
|---|---|
| `apps/web/src/ui/markdown-format.ts` (+ test) | **Pure formatting:** `formatChange(action, { text, start, end })` returns a replacement (`from`, `to`, `insert`) and the new selection; `applyChange` applies it. Bold `**` and Italic `_` wrap or **unwrap** (with or without the markers selected); Heading `### ` and List `- ` prefix each selected line (lines that have it keep one; all prefixed → removed; blank lines skipped; a selection ending at a line break doesn't take the next line); Code wraps in backticks or **fences several lines**; Link gives `[…](url)` with **`url` selected**, or the cursor in `[]`. |
| `apps/web/src/ui/markdown-editor.tsx` (+ test) | **v2 A7's field:** a `tablist` (Write / Preview, arrow keys move between them), a `toolbar` ("Markdown" and six named buttons with tooltips), the mono `Textarea` (6 rows), and Preview through the sanitized `Markdown` in a bordered box. **Controlled** (`value`, `onChange`, `onBlur`, `id`, `invalid`, `disabled`, `placeholder`, `aria-describedby`, `aria-required`) for React Hook Form's `Controller` in 9.5. **Ctrl/⌘+B, Ctrl/⌘+I.** Buttons keep the textarea's selection (no focus steal) and **insert with `insertText` so undo works** (decision 3), falling back to setting the value where that command doesn't exist. |
| `apps/web/src/ui/markdown.tsx` (+ test) | **Images render as links** (decision 2): alt text (or the address) opening in a new tab; an image whose address the sanitizer removed shows only its alt text. Links share one `ExternalLink`. |
| `design/README.md` | "Markdown editor (A7's Feedback field) as built in 9.4". |

## How to verify
```sh
pnpm check     # contracts 76 + web 284 + api 618
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 76 + 284 (+23) + 618. Format and lint clean, with no suppressions. No new dependencies. |
| Formatting (12) | Every row of the plan's table, with and without a selection, and the selection afterwards (written inline as `«…»` / `‸`). Toggling off both ways; bold and italic together; multi-line list with a blank line; a selection ending at a line break; `- One / Two` → `- One / - Two` (not `- - One`); a fenced block; Link selecting `url`. |
| Editor (8) | Write selected with the placeholder, 6 rows, `aria-invalid`, `aria-required` and the description; **the toolbar's six names in v2's order**; typing calls `onChange`; **Bold on a selection → `**PAY-214**`, focus stays, the word stays selected; Link then selects `url`**; List and Heading on lines; **Ctrl+B and ⌘+I**; **Preview** renders the heading and bold, **drops a `<script>`**, hides the textarea and disables the toolbar; **←** returns to Write with focus on its tab; "Nothing to preview yet." for whitespace; everything disabled when the field is. |
| **XSS** (the roadmap's "Done when"; 3 new + 7.5's) | `JaVaScRiPt:`, `&#106;avascript:`, `data:` and `vbscript:` links **keep their text but lose their address**, while an `https` link keeps its own. **`<iframe>`, `<svg onload>`, `<style>`, `<form>`/`<input>` and `style=` never render**, while Markdown around them still does. **Images:** no `<img>` at all; "Diagram" and a bare address become new-tab links; a `javascript:` image keeps only its alt text. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:** the sanitizer removed (1 test: `data:` and `vbscript:` links; `react-markdown`'s own URL filter still blocks `javascript:`, so there are two layers); **the sanitizer removed and every URL allowed** (3 tests); Bold not toggling off (2); Link not selecting `url` (2). That last one first didn't apply because the formatter had split the line, so it was redone. |
| Browser | **None:** nothing shows the editor until 9.5, whose check covers it, including undo in a real browser. |

## Decisions & trade-offs
- **All three decisions as recommended:** v2's six buttons and two shortcuts; images as links; undo through `insertText`.
- **`document.execCommand('insertText')` is deprecated,** but it's still the only way to change a textarea while keeping undo, and all three engines support it. If a browser drops it, the fallback still works; only undo is lost.
- **Not in v2:** "Nothing to preview yet." for an empty Preview, and the buttons' tooltips. Both are small; say if you'd rather not have them.

## Deviations from plan
- **List and Heading leave lines that already have the prefix alone** when adding it to others (found while testing: otherwise `- One` became `- - One`).
- **Unsafe links keep their text without an address,** rather than disappearing; the test was corrected to say so.

## Not done / follow-ups
- **9.5:** the Give feedback dialog using the editor, with the browser check.
