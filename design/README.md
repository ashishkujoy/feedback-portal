# UI design

The UI is designed in Claude Design. **All UI work follows these screens** (see `CLAUDE.md`).

- **Project:** https://claude.ai/design/p/937031fc-fdf0-4c3a-9742-02d65fb499f5
- **Read it with** the claude_design MCP (`DesignSync`):
  - `list_files` and `get_file` with `projectId` `937031fc-fdf0-4c3a-9742-02d65fb499f5`.
  - If it says authorization is missing, run `/design-login`.
- **Nothing from the project is copied into this repo.** The mockups contain the real program name and sample data, so read the source when you need detail. This file is the index.

## Files in the project
| File | What it is |
|---|---|
| `* Mentor Portal.dc.html` | **Canvas.** Lays out every screen by role (IDs below). Each tile embeds the screen file with props. |
| `* Screen.dc.html` | **All screens.** A single parameterised component, with props `role`, `screen`, `tab`, `view`, `dialog`, `device`, `mscreen` and `height`. Its logic script holds the sample data and the colour-code → token map. |
| `_ds/ee-design-system-kuat-…/` | The **Kuat** design system (Equal Experts). It contains `styles.css` (the entry point), `tokens/*.css`, the Lexend fonts, `_ds_bundle.js` (React primitives) and `readme.md` (visual and content rules). |
| `support.js` | The design tool's canvas runtime. It isn't needed for the app. |

## Screens
**Desktop is 1440 wide; mobile is 390×844.** Every desktop screen has the same shell:
- A 240px **Tech Blue sidebar**: logo mark, program name and "Mentor portal", a "Workspace" section, **Batches** (shown as "My batches" for mentors) and **Users and roles** (admin only).
- A top bar with a breadcrumb and a "Viewing as \<role\>" tag. The signed-in user's avatar, name and role label sit at the **foot of the sidebar**.

**Shell measurements** (built in 4.2, in `apps/web/src/shell/`):
- **Sidebar:** 240px, `--sidebar` (Tech Blue 500), padding 20px 12px.
  - Brand block: padding 4px 8px 24px. The program name is 16px/600; "Mentor portal" is 12px `tech-blue-100`.
  - "Workspace": 11px, uppercase, tracking 0.08em, `tech-blue-200`.
  - Nav items: 18px Lucide icon, gap 10px, padding 9px 10px, `--radius-md`, 14px/500. Active: white on 14% white. Idle: `tech-blue-100`.
  - User block: `margin-top:auto`, a 1px top border at 14% white, a 28px initials avatar, the name at 13px/500 and the role at 12px.
- **Top bar:** 56px, `--background`, a 1px bottom `--border`, padding 0 28px.
- **Content:** a `--muted` background, padding 28px, gap 24px. The page title is 28/36, weight 600, tracking -0.6px.
- **The logo mark is left out** (decision in 4.2): no organisation's brand is hard-coded. A configurable logo can come with `GET /settings`.
- **The program name** in the brand block comes from `GET /settings` (4.5). The design shows no organisation name; it appears in the sign-in hint (decision in 4.5).

| ID (Admin / PM / Mentor) | Screen | Props | Contents |
|---|---|---|---|
| A1 / P1 / M1 | Batches | `screen=batches` | One card per batch: status badge, dates, counts (interns, mentors, on notice, terminated), a colour-distribution bar, a mentor avatar stack and **View batch**. Empty state: "No interns yet. Import them from Airtable to get started." Admin and PM also get **Create batch**. Mentors see only their own batches. |
| A2 / P2 / M2 | Batch · interns, cards | `screen=batch` | Header: name, dates, Active badge, the batch's PM; **Import from Airtable** and **Assign mentors** (managers only). Tabs: Interns, Mentors, Notice tracker. A summary strip with counts per colour plus on notice and terminated. Search by username, filter tags (All, colours, On notice, Terminated) and a Cards/Table toggle. Each intern card shows avatar, `@username`, colour, status badge, feedback count, last feedback date and **Give feedback**. |
| A3 / P3 / M3 | Batch · interns, table | `view=table` | Columns: Intern, Colour code, Status, Feedback, Last feedback, action. Footer: "Showing 1–12 of 68". |
| A4 / P4 / M4 | Batch · mentors | `tab=mentors` | Columns: Mentor, Email, Feedback given, Last feedback. Managers also get **Remove**. |
| A5 / P5 / M5 | Batch · notice tracker | `tab=notice` | An "On notice" table with Intern, Colour, Issued, Ends, a remaining-days progress bar (red when 7 days or fewer are left) and Issued by. Managers also get **Lift notice** and **Terminate**. Below it, a "Terminated" list. |
| A6 / P6 / M6 | Intern profile | `screen=intern` | Header with **Lift notice**, **Terminate intern** (managers) and **Give feedback**. A notice callout. **Feedback history**: each entry has the author, date, colour, a Notice badge, the markdown body, its conversation (recorded, or "Awaiting conversation" with **Record conversation** for managers), and comments with an "Add a comment" box. (The design's **Delete feedback** button is not built; see decision 6.) Side panel: current colour (from the latest coloured feedback), notice countdown, colour history and the batch's mentors. |
| A7 / P7 / M7 | Give feedback (dialog) | `dialog=feedback` | Colour code radio list (No colour, Green, Yellow, Orange, Red), each with a description. **Mark as notice** switch. A markdown editor with Write/Preview and B/I buttons. **Submit feedback**. |
| A8 / P8 | Record conversation (dialog) | `dialog=conversation` | Shows the feedback being delivered. Fields: date delivered, delivered by, markdown notes. **Save conversation**. |
| A9 / P9 | Create batch (dialog) | `dialog=createBatch` | Fields: batch name, start date, end date, programme manager. |
| A10 / P10 | Import from Airtable (dialog) | `dialog=airtable` | Fields: API key (not stored), table ID, view name. **Test connection** shows a "68 records found" callout with how many are new and how many are updates. Existing interns are matched by username. |
| A11 / P11 | Assign mentors (dialog) | `dialog=assignMentors` | Mentor search and a checklist showing each mentor's current load. **Save mentors**. |
| A12 | Users and roles | `screen=users` | Role tabs (All, Admins, Programme managers, Mentors) and search by name or email. Columns: Name, Email, a Role select, Batches. **Remove**. |
| A13 | Add user (dialog) | `dialog=addUser` | Full name, email and role. The design says **Send invite**, but there is no invite; see decision 5. |
| MM1–MM5 | Mentor · mobile | `device=mobile`, `mscreen=batches\|interns\|intern\|feedback\|comment` | My batches, a batch's interns (search and filter tags), intern feedback history, give feedback (full-screen form), and a feedback detail with its conversation and comments. |

**Role visibility in the screens:**
- `canManage` (admin and PM) shows create, import, assign, remove, lift notice, terminate, record conversation and delete feedback.
- Mentors give feedback, including notice, and comment.

## Design system (Kuat) essentials
- **Built on shadcn/ui** with Equal Experts brand tokens. It is published on npm as `@equal-experts/kuat-core` (tokens), `@equal-experts/kuat-react` and `@equal-experts/kuat-vue`. **Decided in 4.1:** the web app uses `@equal-experts/kuat-core` for the tokens (its Tailwind v4 `@theme`), with self-hosted fonts instead of its Google Fonts import. Components (`kuat-react` or written in-repo) are decided when a screen first needs them.
- **Primitives the screens use:** Button, Input, Textarea, Select, Checkbox, Switch, Avatar, AvatarStack, StatusBadge, Tag, Callout, Tabs, Breadcrumb, Dialog and Logo.
- **Type:**
  - **Lexend** for all UI text. Headings use weight 600 with tight tracking. Body text is 16/24.
  - JetBrains Mono for code and data.
- **Colour:**
  - EE Blue `#1795D4` is the primary colour. Tech Blue `#22567C` is used for the sidebar and chrome. Neutrals use the Slate scale.
  - The extended palette is only for categorical coding, which here means **colour codes**:
    - Green → `uptime-green` (500 dot / 50 background / 700 text)
    - Yellow → `signal-yellow` (300 / 50 / 700)
    - Orange → `equal-ember` (500 / 50 / 700)
    - Red → `runtime-red` (600 / 50 / 700)
    - No colour → `slate` (300 / 100 / 600)
- **Corners:** flat by default.
  - Cards, tables, dialogs and menus: `--radius-none`.
  - Interactive elements: `--radius-md`.
  - Form inputs: `--radius-sm`.
  - Pills and avatars: fully rounded.
  - Never hard-code a pixel radius.
- **Borders, shadows and backgrounds:** 1px Slate-200 hairline borders. Shadows are soft and used sparingly. No gradients.
- **Icons:** Lucide, with a 2px stroke. No emoji.
- **Copy:** sentence case everywhere. Buttons start with a specific verb ("Create batch", "Submit feedback").

## Screens the design doesn't have (built in 4.4, branded in 4.5)
Built from Kuat's own guidance with the design's tokens. A designer can replace them.
- **Sign-in (`/login`):** a centred, flat card (max 400px, 32px padding) on `--muted`. It holds the sidebar's brand pair recoloured for a light card (the program name at 16px/600 above "Mentor portal" at 12px muted), a "Sign in" heading (24px/600), "Use the \<Org\> Google account an admin added for you." (without the name if `/settings` fails), and a full-width outline **Sign in with Google** button with Google's "G" mark. After a failure there's an `issue` Callout ("We couldn't sign you in"), and when Google isn't configured a `warning` Callout. This follows Kuat's `scenarios/authentication.md`; the 6px card radius suggested there is replaced by the design's flat cards.
- **Sign out:** a `log-out` icon button (18px, `tech-blue-100`, 32px hit area, `--radius-md`, 8% white hover) at the right end of the sidebar's user block.
- **Not found:** the page-title style ("Page not found") inside the shell, with a link to Batches (4.2).

## Differences from PRODUCT.md
Decided 2026-10-16. PRODUCT.md, DATA_MODEL.md, TECH_STACK.md, ROADMAP.md and contracts are updated to match.

| # | Topic | Decision |
|---|---|---|
| 1 | Colour codes | **Six codes plus "no colour"**: Green, Yellow, **Borderline Yellow**, Orange, **Borderline Red**, Red. The domain terms are `borderline_yellow` and `borderline_red`, replacing "nearly". The design shows only four codes, so the UI must add both borderline codes to the colour picker, the colour bar, the filters and the summary, using the same token pattern. |
| 2 | Notice | **As designed.** Feedback marked as notice puts the intern on notice when it is submitted, whether a mentor or the PM wrote it. The notice lasts one month. The PM can **lift** it or **terminate** the intern. |
| 3 | Roles per user | **As in PRODUCT.md: several roles per user.** The design's single Role select on Users and roles must become a multi-select (or a set of checkboxes). |
| 4 | Airtable import | **As designed.** An admin or the batch's PM can import repeatedly. Interns are matched by `username`; new ones are added and existing ones updated. |

| 5 | Adding users | **As in PRODUCT.md.** An admin adds the user's email and roles, and the user signs in with Google. **No invite email is sent.** In the Add user dialog, replace "Send invite" with "Add user", and change the "They receive an email invite" copy to say they can sign in with Google using that email. |
| 6 | Deleting feedback | **Not allowed.** Leave the design's **Delete feedback** button out of the intern profile. |
| 7 | End of notice | **Termination is always manual.** Nothing happens automatically when the notice period ends; the PM uses **Terminate** (or **Lift notice**). Don't use the design's "is terminated at the end unless it is lifted" copy. Say instead that the PM can lift the notice or terminate the intern. |
