# 9.4 Markdown components — Plan

**Phase:** 9 — Feedback
**Status:** Done

## Goal
Markdown components: an editor with a Write/Preview toggle and a sanitized renderer

## Done when
- **`ui/markdown-editor.tsx`**, v2 A7's Feedback field:
  - **Write / Preview** tabs (13px/500, padding 6px 10px; the selected one in `--primary` with a 2px underline), a real `tablist`, switched by click or arrow keys;
  - on the right, **"Markdown"** (12px muted) and **six 30×30 toolbar buttons** in v2's order: **Bold** ("B", 700), **Italic** ("I", Georgia italic), **Heading**, **Bulleted list**, **Code**, **Link** (v2's icons), each with an accessible name and a tooltip;
  - **Write:** the existing `Textarea` (mono, 6 rows) with the placeholder passed in;
  - **Preview:** the existing `Markdown` renderer in a bordered box (`--radius-sm`, padding 12px 14px, min-height 132px). Toolbar buttons are disabled on Preview.
- **A controlled component** (`value`, `onChange(text)`, plus `id`, `invalid`, `disabled`, `placeholder`, `aria-describedby`, `aria-required`), so 9.5 binds it with React Hook Form's `Controller`.
- **The renderer stays `ui/markdown.tsx`** (7.5), with the hardening below. **The roadmap's "Done when": a test shows XSS content is stripped**, extended to the cases below.
- `pnpm check` passes.

## What the toolbar does
| Button | With a selection | With none |
|---|---|---|
| Bold | `**selection**` | `****` with the cursor in the middle |
| Italic | `_selection_` | `__`, cursor in the middle |
| Heading | `### ` before each selected line | `### ` at the start of the line |
| Bulleted list | `- ` before each selected line | `- ` at the start of the line |
| Code | `` `selection` ``; several lines → a fenced ```` ``` ```` block | ` `` `, cursor in the middle |
| Link | `[selection](url)` with **`url` selected**, to type over | `[](url)`, cursor in the brackets |

Applying Bold or Italic to text already wrapped that way **removes** it (a toggle). **Ctrl/⌘+B** and **Ctrl/⌘+I** do the same in the textarea.

## Renderer hardening
The renderer already drops raw HTML (7.5's test: `<script>`, `<img onerror>`, `onclick`, `javascript:` links). Added cases:
- links with **`JaVaScRiPt:`**, **`&#106;avascript:`**, **`data:`** and **`vbscript:`** URLs lose their `href`;
- **`<iframe>`, `<svg onload>`, `<style>`, `<form>` and `style=` attributes** never render;
- **images** (decision 2).

## Decisions needed

### (1) The toolbar
**Recommended:** v2's six buttons as in the table, plus the two shortcuts; nothing more (no numbered list, quote or table). The text the author sees is plain Markdown, so anything else can still be typed.

### (2) Images in Markdown
`![alt](https://…)` currently renders as an `<img>` loading any web address. That lets an author pull in tracking pixels or huge pictures, and v2 never shows images in feedback, notes or reasons.

| Option | What it means |
|---|---|
| **A. Show images as links** *(recommended)* | `![Diagram](https://…)` renders as a link "Diagram" (or the address when there's no alt text), opening in a new tab, like other links. Nothing is fetched until someone clicks. |
| B. Render images | Keep `<img>` for `https:` addresses only. |
| C. Drop them | Only the alt text shows. |

### (3) Undo after a toolbar button
Setting the textarea's value from code empties the browser's undo history, so Ctrl/⌘+Z wouldn't undo a Bold.

**Recommended:** insert with the browser's **`insertText`** editing command, which keeps undo working in Chrome, Firefox and Safari. Where it isn't available (test environments), the value is set directly.

## Plan
- **`ui/markdown-editor.tsx`:** the component; the formatting as **pure functions** in `ui/markdown-format.ts` (`(text, selectionStart, selectionEnd) → { text, selectionStart, selectionEnd }`), so each rule is unit-tested without a browser.
- **`ui/markdown.tsx`:** an `img` component rendering a link (decision 2); the sanitize schema checked for the cases above (`rehype-sanitize`'s default already limits link protocols to `http`, `https`, `mailto`, `xmpp`, `irc`, `ircs`).
- **No new dependencies.**

### Tests
- **`markdown-format.test.ts`:** every row of the table, with and without a selection, multi-line Heading, List and Code, the Bold/Italic toggle, and the selection after each.
- **`markdown-editor.test.tsx`:** the tabs (click and arrow keys, `aria-selected`), the six buttons' names, a button changing the text through `onChange` and keeping focus in the textarea, the shortcuts, Preview rendering the Markdown, the toolbar disabled on Preview and when the editor is disabled, `invalid` and `aria-describedby` passed to the textarea.
- **`markdown.test.tsx`:** the hardening cases above; an image as a link.
- **Mutations** (on copies, restored with `cp`): sanitizing removed (the XSS test); Bold not toggling off; the link's `url` not selected. Each must fail a test.

### Out of scope
- **Using it:** the Give feedback dialog (9.5). Interview notes and status reasons keep their plain textarea (v2 draws them that way).
- **A browser check:** nothing shows the editor until 9.5, whose check covers it (including undo in a real browser).

### Steps
1. The formatting functions and their tests.
2. The editor and its tests.
3. The renderer's hardening and tests.
4. `pnpm check`, mutations, `REVIEW.md`.

### Verification
- `pnpm check` exits 0; the mutations fail tests.
