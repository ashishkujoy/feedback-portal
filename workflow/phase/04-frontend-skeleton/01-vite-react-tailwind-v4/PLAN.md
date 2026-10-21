# 4.1 Vite + React + Tailwind v4 — Plan

**Phase:** 4 — Frontend skeleton
**Status:** Done

## Goal
`apps/web`

## Done when
- `pnpm --filter @feedback-portal/web dev` serves a page at http://localhost:5173 (the API's default `WEB_APP_URL`). The page is styled with the design system's tokens: Lexend, the EE colours and Kuat's radius scale.
- `pnpm --filter @feedback-portal/web build` produces a static `dist/`.
- `pnpm check` covers the web app: format, lint (with the React rules), typecheck and a component test.

## Carried over
- **UI linting** (deferred from 0.3): add an oxlint override for `apps/web/**/*.{ts,tsx}` with the `react`, `jsx-a11y`, and `react-perf` plugins. Rules: `react/rules-of-hooks`, `react/exhaustive-deps`, `react/jsx-key` = error, `react/react-in-jsx-scope` = off, and jsx-a11y as errors. Verify with real `.tsx` samples, including type-aware rules.
- **Verify `react.json`** (deferred from 0.2) against real React + Vite types.
- Decide whether to enable oxfmt `sortTailwindcss` / `sortImports`.

## Plan

### Decision needed (1): how the design system's tokens get into Tailwind
The design project is built on **Kuat**, Equal Experts' design system. Its token files say they are aligned to Kuat **v0.15.2**. Kuat is published on npm.

| Option | What it means |
|---|---|
| **A. `@equal-experts/kuat-core@0.15.3` (tokens only)** *(recommended)* | MIT. Its only peer dependency is `tailwindcss ^4`. `variables.css` holds the same semantic tokens as the design project (`--primary`, `--sidebar`, `--destructive`, the RAG layer, `--radius-none/sm/md`, shadows, the brand ramps) and **ships a Tailwind v4 `@theme inline` block**, so `bg-primary`, `bg-sidebar`, `rounded-md` and `text-muted-foreground` work straight away. Version upgrades come from Kuat itself, not from re-copying CSS by hand. This does what CLAUDE.md asks: the tokens are mapped into the Tailwind theme, not copied. |
| B. Port the tokens into our own `@theme` by hand | Full control, but about 700 lines of CSS to keep in step with the design system by hand. |
| C. `@equal-experts/kuat-react` (components too) | Ready-made shadcn components. But it needs **26 Radix packages** as peer dependencies, plus `lucide-react`, `sonner` and `embla-carousel-react`. We'd take all of them before we know which components the screens use. That can be decided per component in later tasks; it doesn't need to be decided now. |

**The 6 feedback colour codes** (design decision 1: green to red, including both borderline codes) are not in Kuat. They're a product token map, which the colour-code UI tasks add to our own `@theme`. Nothing is needed for them in 4.1.

### Decision needed (2): fonts
Kuat's `fonts.css` loads Lexend, Lora and JetBrains Mono **from Google Fonts** with a remote `@import`.

| Option | What it means |
|---|---|
| **A. Self-host from npm: `@fontsource-variable/lexend` and `@fontsource-variable/jetbrains-mono` (5.3.0)** *(recommended)* | The fonts are bundled by Vite and served from our own origin. No third-party request reveals users' IPs to Google, a future CSP can stay `font-src 'self'`, and it works offline. Lora (serif) isn't used by any screen, so it's left out. We skip `kuat-core/fonts.css` and keep Kuat's `--font-sans` and `--font-mono` names. |
| B. Use Kuat's `fonts.css` (Google Fonts) | One line, but every page load calls `fonts.googleapis.com`. |

The rest of the plan assumes **A** for both.

### The app (`apps/web`, package `@feedback-portal/web`)
```
apps/web/
  index.html            # <html lang="en">, <div id="root">; the title comes from config in 4.5, until then a neutral "Feedback portal"
  vite.config.ts        # @vitejs/plugin-react + @tailwindcss/vite; port 5173 (strictPort)
  vitest.config.ts      # jsdom, Testing Library setup
  tsconfig.json         # extends @feedback-portal/tsconfig/react.json
  package.json          # dev, build, preview, typecheck, test
  src/
    main.tsx            # createRoot(...).render(<StrictMode><App/></StrictMode>)
    app.tsx (+ test)    # the placeholder page
    styles.css          # fonts → tailwindcss → kuat-core/variables.css → small base layer
```
- **Versions:** each one more than 1 day old, as the release-age rule requires.
  - `vite@8.3.4`: 8.3.5 was published today, so it's too new.
  - `react` and `react-dom@19.3.1`, `@vitejs/plugin-react@6.1.2`.
  - `tailwindcss` and `@tailwindcss/vite@4.3.3`.
  - `@types/react` and `@types/react-dom@19.3.0`.
  - Tests: `vitest@5.0.2` (the same as the API), `@testing-library/react@16.3.3`, `@testing-library/jest-dom@7.0.1` and `jsdom@30.1.3`.
- **The page:** a single centred block on `bg-background` / `text-foreground` in Lexend, reading "Feedback portal" with a muted line saying it's the web app skeleton.
  - It **only proves that the tokens and fonts load.** It invents no layout, and 4.2 replaces it with the design's shell (the Tech Blue sidebar and top bar).
  - It shows **no program or organisation name**. Those arrive with `GET /settings` in 4.5.
- **No routing, data fetching or API proxy yet.** Those are 4.2 and 4.3.

### Tooling
- **oxlint:**
  - An override for `apps/web/**/*.{ts,tsx}` adds the `react`, `jsx-a11y` and `react-perf` plugins. The rules: `react/rules-of-hooks`, `react/exhaustive-deps` and `react/jsx-key` are errors; `react/react-in-jsx-scope` is off; jsx-a11y rules are errors.
  - It's verified with deliberately bad `.tsx` samples in a scratch folder: a hook called conditionally, a missing key, an `<img>` without `alt`, and a type-aware rule (a floating promise in a component). Each must fail lint.
- **`react.json` is checked against real types.** `vite/client` resolves, JSX is typed, `.tsx` import extensions work, and `tsc -p apps/web` passes. Anything that's wrong gets fixed in `packages/tsconfig`.
- **oxfmt:**
  - **Turn on `sortTailwindcss`** for `apps/web`, pointed at `src/styles.css` so it knows the Kuat theme. Class order then never needs reviewing.
  - **Leave `sortImports` off.** Enabling it would reorder every file in the API for no behaviour change. We can revisit it on its own if wanted.
- **Workspace:**
  - `pnpm -r` already picks up `typecheck` and `test` from the new package.
  - The root gets `dev:web` and `build:web` aliases.
  - `.gitignore` already ignores `dist/`.

### Tests
- **`app.test.tsx`** (Vitest + Testing Library + jsdom): the page renders its heading and the line below it, and nothing else. This proves that the JSX, test setup and jest-dom matchers work. 4.5 adds the test that the names shown come from `GET /settings`.

### Docs
- **README:** "Web app" — `pnpm dev:web`, the port, and that it needs no API yet.
- **TECH_STACK:** the token source (`@equal-experts/kuat-core`) and the self-hosted fonts.
- **design/README.md:** answer the open "kuat-core package vs port the tokens" question from "Design system (Kuat) essentials".

### Out of scope
- **The layout shell, routing and Query:** 4.2.
- **The API client and Vite proxy:** 4.3.
- **The login page:** 4.4. The design project has no sign-in screen, so 4.4 will have to raise it.
- **Branding from `GET /settings`:** 4.5. **The web container:** 4.6.
- **Components** (Button, Avatar, …), whether from `kuat-react` or written in-repo: decided when a screen first needs them.
- **Dark mode:** Kuat supports `.dark`, but no screen shows it.

### Steps
1. Scaffold `apps/web` with pinned versions. Check `pnpm-workspace.yaml` for added release-age exclusions.
2. Add the styles (fonts, Tailwind, Kuat) and the placeholder page.
3. Lint override and oxfmt `sortTailwindcss`, verified with bad samples.
4. Vitest setup and the page test.
5. Docs. Run `pnpm check` and `build:web`, open the page in a browser, take a screenshot, and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0, and `pnpm build:web` produces `apps/web/dist`.
- `pnpm dev:web`, then the page at http://localhost:5173. In the browser I check:
  - the body font is **Lexend**;
  - `--primary` resolves to EE Blue;
  - **no request goes to a third-party font host.**
- The lint samples fail as expected and are deleted afterwards.
