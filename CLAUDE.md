# Project instructions

## UI design source (all UI work)
Every UI task (pages, components, layout, styling) must follow the screens in the Claude Design project below. Do not invent layouts or styles that the design doesn't show. If a screen you need is missing, say so and ask before improvising.

- **Design project:** https://claude.ai/design/p/937031fc-fdf0-4c3a-9742-02d65fb499f5
- **Start with `design/README.md`.** It indexes every screen (IDs A1–A13, P1–P11, M1–M7, MM1–MM5), lists the design-system rules, and records where the design differs from PRODUCT.md.
- **Main file:** `* Mentor Portal.dc.html` (the canvas). The screens themselves live in `* Screen.dc.html`.
- **Also read** the files that the main file imports:
  - `_ds/ee-design-system-kuat-…/_ds_bundle.js`
  - `_ds/ee-design-system-kuat-…/styles.css`
  - `support.js`
- **How to read it:** use the claude_design MCP (`DesignSync`, `list_files`/`get_file`). If it reports missing authorization, ask the user to run `/design-login`.
- **Don't copy the design files into the repo.** They contain the real program name and sample personal data. Read them from the project when needed.
- **Behaviour conflicts:** the design decides layout and style. When the design and PRODUCT.md disagree on *behaviour*, check `design/README.md` → "Differences from PRODUCT.md". If an item is still open, ask the user.

When turning the design into code:
- Use the stack in `TECH_STACK.md` (React, Tailwind CSS v4). Map the design system's tokens (colours, type, spacing) into the Tailwind theme instead of copying its CSS by hand.
- The program and organisation names in the mockups are sample content. In code they always come from config (`PROGRAM_NAME`, `ORG_NAME` via `GET /settings`). Never hard-code them, and never use them in file or folder names.

## Workflow
- Tasks follow `ROADMAP.md` and the board in `workflow/README.md`.
- Each task goes through PLAN.md → approval → implement → REVIEW.md → approval → Done → commit.
