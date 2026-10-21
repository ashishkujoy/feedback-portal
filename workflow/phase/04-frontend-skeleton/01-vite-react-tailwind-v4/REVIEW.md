# 4.1 Vite + React + Tailwind v4 — Review

## What changed
| File | Notes |
|---|---|
| `apps/web/package.json` | **New package `@feedback-portal/web`.** Scripts: `dev`, `build`, `preview`, `test`, `typecheck`. Pinned versions, each more than 1 day old: `vite@8.3.4` (8.3.5 was published today), `react`/`react-dom@19.3.1`, `@vitejs/plugin-react@6.1.2`, `tailwindcss`/`@tailwindcss/vite@4.3.3`, `@equal-experts/kuat-core@0.15.3`, `@fontsource-variable/lexend` and `jetbrains-mono@5.3.0`, `@types/react`/`react-dom@19.3.0`, `vitest@5.0.2`, `@testing-library/react@16.3.3`, `@testing-library/jest-dom@7.0.1`, `jsdom@30.1.3`. **No release-age exclusions were added** to `pnpm-workspace.yaml`. |
| `apps/web/vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `index.html` | React and Tailwind plugins. Port 5173 with `strictPort`, because it's the API's default `WEB_APP_URL`. Tests run in jsdom with jest-dom matchers. The tsconfig extends `react.json`. The title is a neutral "Feedback portal". |
| `apps/web/src/styles.css` | Imports in this order: fonts (`@fontsource-variable/*`), then `tailwindcss`, then `@equal-experts/kuat-core/variables.css` (Kuat's tokens and `@theme inline`). Then an **unlayered** `:root` override of `--font-sans` and `--font-mono`, and the `body` base styles. |
| `apps/web/src/app.tsx` (+ test), `main.tsx`, `test-setup.ts` | The placeholder page: a centred "Feedback portal" with a muted "Web app skeleton" line |
| `.oxlintrc.json` | **A web override** (`apps/web/**/*.{ts,tsx}`) with the `react`, `jsx-a11y` and `react-perf` plugins (`jsx-no-new-function-as-prop` off, per review). `react/rules-of-hooks`, `react/exhaustive-deps` and `react/jsx-key` are errors; `react/react-in-jsx-scope` is off; **all 36 jsx-a11y rules** are errors. `import/no-unassigned-import` allows only `**/*.css` and `@testing-library/jest-dom/vitest`. |
| `.oxfmtrc.json` | **`sortTailwindcss` for `apps/web`**, reading `apps/web/src/styles.css` so it knows the Kuat utilities. `sortImports` stays off. |
| `package.json` | Root scripts `dev:web` and `build:web` |
| `README.md`, `TECH_STACK.md`, `design/README.md` | "Web app". The styling row names `kuat-core` and the self-hosted fonts. The open "package vs port" question in the design README is now answered. |

## How to verify
```sh
pnpm check       # contracts 52 + web 1 + api 293
pnpm build:web   # apps/web/dist
pnpm dev:web     # http://localhost:5173
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** Format, lint (with the web rules), typecheck of all three packages, and tests: 52 + 1 + 293. |
| `pnpm build:web` | Builds in about 0.1 s: 52 kB CSS (10 kB gzip), 220 kB JS (69 kB gzip), and 4 self-hosted woff2 files (Lexend and JetBrains Mono, latin and latin-ext). The built CSS has **0** `googleapis` references. |
| Browser (Chrome, dev server) | The `h1` font is `"Lexend Variable"` at weight 600, and `document.fonts` reports Lexend loaded. `--primary` resolves to `oklch(0.645 0.163 237.5)`, which is **EE Blue `#1795D4`**. The body background is white (`--background`), and the muted line uses `--muted-foreground`. **No requests to any other host.** The title is "Feedback portal". |
| Lint catches bad React code | A scratch `.tsx` sample (since deleted) was flagged for: a conditional hook (`rules-of-hooks`), a missing effect dependency (`exhaustive-deps`), a missing `key` (`jsx-key`), an `<img>` without `alt`, a `div` with `onClick` but no role or key handler (2 a11y rules), and an async handler on `onClick` (**type-aware** `no-misused-promises`). A side-effect import other than the 2 allowed ones also fails. |
| `react.json` is checked against real types | `tsc -p apps/web` passes with `vite/client` types, the CSS import, `.tsx` import extensions and React 19's JSX types. A deliberate type error in a `.tsx` sample is reported (TS2339). Nothing in `packages/tsconfig` needed changing. |
| Tailwind sort | A deliberately shuffled `className` is reordered. Kuat classes (`bg-sidebar`, `text-muted-foreground`) are recognised and sorted, and unknown classes go first. |

## Decisions & trade-offs
- **Decisions taken (A and A):** the tokens come from `@equal-experts/kuat-core` (no hand-copied CSS), and the fonts are self-hosted.
- **The font override has to be unlayered.** Kuat sets `--font-sans: Lexend, …` on an unlayered `:root`, which beats Tailwind's layered `@theme`. The self-hosted variable fonts register as `Lexend Variable` and `JetBrains Mono Variable`, so without the override the page silently fell back to a system font. I found this in the built CSS before opening the browser.
- **`import/no-unassigned-import` is configured, not disabled.** Only CSS files and jest-dom's matcher registration may be imported for their side effects.
- **`sortImports` is off,** so this change doesn't reorder every API file. It can be its own small change if wanted.

## Deviations from plan
- **The "no program name" test was dropped.** A test that forbids the sample names would have to contain them. The page test checks the exact text instead, and 4.5 tests that names come from `GET /settings`.
- **The jsx-a11y rules are listed one by one.** oxlint overrides can't set categories, so I listed all 36 rules from oxlint's schema as errors.

## Reviewer answers (applied)
1. **`react-perf/jsx-no-new-function-as-prop` is off** in the web override. Inline handlers are allowed. The other `react-perf` rules stay on; a sample with an inline `style={{…}}` is still flagged by `jsx-no-new-object-as-prop`.
2. **Arctic replacement is added as task 3.9** ("Replace Arctic") in ROADMAP and on the board. The task folder records what was found: `arctic@3.7.0` and its `@oslojs/*` dependencies are marked "no longer supported" on npm, and the integrity still matches our lockfile. Correction to 3.6: that review mentioned only the `@oslojs` packages.
