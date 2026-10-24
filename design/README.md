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
| **`Mentor Portal v2.dc.html`** | **The current canvas (v2, added 2026-10-24).** It formalises the screens built so far and draws the rest of the roadmap. Each artboard names the props that render it. Index below. |
| **`Portal Screen.dc.html`** | **v2's screens.** One parameterised component: `role`, `screen`, `batch`, `intern`, `tab`, `view`, `state`, `device` and `mscreen`. A `state` prop draws loading, empty, error and other states. |
| **`Portal Dialog.dc.html`** | **v2's dialogs**, rendered alone: `dialog` and `state` (for example `dialog="addIntern" state="errors"`). |
| `* Mentor Portal.dc.html` | **The v1 canvas,** kept for reference. Lays out every screen by role (IDs below). Each tile embeds the screen file with props. |
| `* Screen.dc.html` | **v1's screens.** A single parameterised component, with props `role`, `screen`, `tab`, `view`, `dialog`, `device`, `mscreen` and `height`. Its logic script holds the sample data and the colour-code → token map. |
| `_ds/ee-design-system-kuat-…/` | The **Kuat** design system (Equal Experts). It contains `styles.css` (the entry point), `tokens/*.css`, the Lexend fonts, `_ds_bundle.js` (React primitives) and `readme.md` (visual and content rules). |
| `support.js` | The design tool's canvas runtime. It isn't needed for the app. |

## v2 screens
**v2 decides wherever it and v1 differ.** IDs: A (admin), P (programme manager), M (mentor), MM (mentor mobile); a suffix such as `-errors` marks a state. The sample "today" is 24 Oct 2026.

| Section | Artboards |
|---|---|
| Reference | **REF-1** the six colour codes plus No colour, in severity order; **REF-2** intern statuses and the actions between them |
| Batches | **A1** / **M1** (with `-empty`, `-loading`, `-error`); **A9** Create batch (`-errors`); **A16** Change programme manager (`-error`); **A17** Archive batch (`-error`, `-archived`: the archived batch page) |
| Batch page | **A2** interns as cards, **A3** as a table, **M2** the mentor's view; `A2-completed`, `A2-asbuilt` (before interns), `A2-empty`, `A2-noresults`, `A2-loading`, `A2-error`; **A4** Mentors tab (`-empty`); **P5** Notice tracker (`A5-empty`); **P24** Overview (batch dashboard); **A25** Imports history; **A14** Add intern (`-errors`, `-success`); **A10** Import from Airtable (`-sourceerrors`, `-preview`, `-importing`, `-result`, `-failed`); **A11** Assign mentors (`-unchanged`, `-nomatch`, `-nomentors`, `-error`) |
| Intern profile | **P6** / **M6** timeline; `A6-nofeedback`, `A6-readonly`, `A6-banners`, `A6-photo`; **P22** Details tab; **P23** Status history tab; **P7** / **A7** Give feedback (`-preview`, `-notice`, `-readonly`, `-errors`, `-servererror`); **P8** Record conversation (`-errors`, `-empty`, `-servererror`); **A15** Edit details (`-errors`); **P18** Lift notice (`-errors`), **P19** Terminate, **P20** Graduate, **P21** Withdraw |
| Users and roles | **A12** (`-menuself`, `-menusingle`, `-refusal`, `-empty`, `-remove`); **A13** Add user (`-errors`) |
| My pending | **M26** Needs feedback (`-drafts`, `-empty`, `-discard`); **P26** To deliver |
| Global | **A27** Page not found; **A28** Page load error; **A29** Sign in (`-notsetup`, `-removed`, `-domain`, `-failed`) |
| Mentor mobile | **MM1**–**MM5** as in v1, **MM4** states (`-notice`, `-disabled`), **MM6** My pending (`-drafts`) |

### Built before v2
These screens were built from v1 or improvised, and v2 now draws them. **Compare each with v2 when its area is next touched** (follow-ups, not done yet):
- the shell, and Sign in (4.4 → **A29**), Page not found (→ **A27**);
- Users and roles and Add user (5.1–5.3 → **A12**, **A13**);
- the batch list, the batch page and Create batch (6.5 → **A1**, **A2-asbuilt**, **A9**). A1's counts and colour bar are done (7.8); its separate Archived badge and its loading and error states are not;
- Assign mentors and the Mentors table (6.6 → **A11**, **A4**).

### Add intern (A14) as built in 7.3
- **Add intern** (outline, `plus`) sits in the batch header before Assign mentors, for the batch's managers. A2's **Archive batch** and **Import from Airtable** come with their tasks.
- **Email is required** (7.3 decision 1): the dialog marks it, unlike A14, because every intern has an email (DATA_MODEL).
- **Usernames are stored lower-cased** (decision 2), as A14's help text says.
- **The success sentence is "\<Name\> is on the roster as Active, with no colour code."** (decision 3): no pronoun, and nothing about features not built yet.

### Batch page and roster (A2, A3, M2, A4) as built in 7.4
- **Tabs:** only **Interns** (first) and **Mentors** (6.6's Mentors and Past members tables) for now (7.4 decision 1). Overview, Notice tracker and Imports come with their tasks.
- **No feedback parts yet** (decision 2): cards have no "N feedback · date" or Give feedback, and their footer appears only for **Read-only**. The table has Intern, Colour code, Status and a Read-only column, without Feedback and Last feedback.
- **Filters:** one at a time (decision 3). Choosing the selected tag again goes back to All. The tab, view, filter and search are in the URL (`?tab=mentors&view=table&filter=red&q=ish`), with the defaults left out; typing a search replaces the history entry.
- **Order:** by name, ignoring case and accents; everything loads at once (decision 4).
- **Not yet** (decision 5): photos (initials only), links to the profile, and Import from Airtable. The empty state for managers says "Add interns one at a time." with **Add intern**, instead of v2's sentence about importing.
- **No results** for a filter without a search names the filter: "No interns match "Red"". v2 only draws the search case.
- **Kuat Tag in toggle mode** is full size (8px 10px, 14/21), so the 12 tags wrap to a second line at 1440px.

### Batch card counts (A1) as built in 7.8
- **Stats:** Interns, Mentors, On notice, Terminated; before anyone is added, Mentors only, with "No interns yet." in place of the colour bar.
- **The counts cover every intern, whatever their status** (7.8 decision 1), the same as the roster's All.
- **The colour bar leaves out empty codes** (decision 3), so the 2px gaps are only between real segments; the legend lists all seven codes, including zeros.
- **The Interns tab count on the batch page** comes from these counts, so it shows before the roster loads.

### Intern profile (P6 / M6, P22, P23, A6) as built in 7.5
- **At `/batches/:batchId/interns/:internId`**, with the crumbs Batches › \<batch\> › \<intern\>. Roster names link to it: only the name, so nothing interactive nests.
- **Left out until their tasks** (7.5 decision 1): Give feedback (Phase 9), the photo button (7.7), the colour history and "Linked feedback" (Phase 9), and Edit details (7.9).
- **Timeline:** v2's empty state without its button (decision 2), naming the intern by first name.
- **Status history** is built (decision 3). The onboarding row, which has no reason, reads "Added by hand." or "Imported from Airtable.". Reasons render as Markdown.
- **On-notice banner** without "with \<colour\> feedback" until Phase 9 (decision 5). Once a notice has ended: "Notice ended on \<date\> · decision needed".
- **Colour code note:** "Set by the first coloured feedback." / "From the latest coloured feedback." (decision 6). **Mentors:** "N mentors in this batch" (v2: "active mentors"), since inactive users can still be assigned.
- **Markdown** (`ui/markdown.tsx`): v2's prose sizes (14/22, 15px/600 headings, 10px between blocks, mono inline code on slate 100). It uses react-markdown with remark-gfm, and rehype-sanitize, so raw HTML is never rendered.
- **Missing details** show "—". Notes left empty show "No interview notes."

### Status changes (P18–P21) as built in 7.6
- **Header buttons for the batch's current PM only** (7.6 decision 1), not in an archived batch (decision 2), and not once final. Active: Withdraw (ghost-muted), Graduate (outline). On notice: Withdraw, Terminate (destructive), Lift notice (outline).
- **The dialogs follow v2,** with the points rewritten without pronouns ("The status changes to …", "The record becomes read-only."). Lifting the notice of an intern without a colour code says "There is no colour code until the first coloured feedback."
- **An empty reason says "Add a reason."** (decision 3), from the shared contract and the domain. A refusal from the API shows an `issue` Callout, "We couldn't …", and keeps the reason.
- **After a change** the dialog closes and the profile shows the answer. The roster, batch and batch list refresh (decision 5).

## Screens (v1)
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

## Users and roles (A12) as built in 5.1
- **Role column:** in 5.1, the roles as text, most privileged first ("Admin, Mentor"). Since 5.3 it's editable (below).
- **Inactive users:** a neutral StatusBadge "Inactive" after the name, and the name in `--muted-foreground`. They stay in their role tabs and counts. The design shows no inactive users.
- **Left out until its task:** the Batches column (Phase 6). **Add user** came in 5.2, and **Remove** and the action column in 5.3 (below).
- **Description:** "Admins manage the portal. Programme managers run their batches and record conversations. Mentors give feedback and comment." The design's "record and delete feedback" contradicts decision 6.
- **States the design doesn't draw:** while loading, the table is empty; an error shows an `issue` Callout, "We couldn't load users"; when nothing matches, a single row reads "No users match your search."
- **The tab and search are in the URL** (`?role=mentor&q=…`), and the list is sorted by name, ignoring case and accents.

## Add user (A13) as built in 5.2
- **Roles are three Kuat Checkboxes** (Admin, Programme manager, Mentor; Mentor checked by default) under the label "Roles", instead of the design's single Role select (decision 3). The design's help text stays under them.
- **Copy (decision 5):** the description is "They sign in with their \<Org\> Google account, using this email." (the org name from `GET /settings`), and the primary button is **Add user** ("Adding…" while saving), not "Send invite".
- **Errors the design doesn't draw** use Kuat Field's error state: the Input border turns `--destructive` and the message (12px, `--destructive`) replaces the help text. Messages come from the shared contract. A taken email shows under Email ("A user with this email already exists."); any other failure shows an `issue` Callout, "We couldn't add this user", above the footer.
- **A native `<dialog>`** (`showModal()`), styled to Kuat's Dialog: focus is trapped, Escape and an overlay click close it, and focus returns to the Add user button. No toast on success: the dialog closes once the new user is in the list.

## Editing roles and removing users (A12) as built in 5.3
- **The Role cell is the design's Select (`sm`, 180px), choosing several roles** (decision 3). The trigger shows them, most privileged first, cut off with "…" when they don't fit (the full list is its accessible name and tooltip). The list keeps Kuat's options (`--accent` and a `--primary` check when chosen), but each is a real checkbox: **ticking one saves at once** and the list stays open. The column header is "Roles".
- **Disabled options say why:** your own Admin ("You can't remove your own admin role") and a user's only role ("A user needs at least one role; remove them instead"), as a 12px muted line under the label.
- **Remove** (ghost-muted, `sm`) asks first, in a Kuat Dialog: "Remove \<Name\>?", "They're signed out and can't sign in. Their feedback and comments stay, and you can add them back.", with Cancel and a `destructive` **Remove**. An inactive user's button is **Reactivate**, which works at once. **Your own row has no button.**
- **Changes show immediately** from the API's answer (no reload); the row is blocked while saving. A refusal shows an `issue` Callout above the table, "We couldn't update \<Name\>", with the API's reason; it clears after the next successful change.

## Batches (A1, A2, A9) as built in 6.5
Interns arrive in Phase 7 and feedback in Phase 8, so this is the "before interns" version of screens the design draws with interns.
- **Batch card (A1):** status badge, dates, name, a stats row with **Mentors** only, and the footer (mentor AvatarStack, View batch). Interns, On notice, Terminated, the colour bar and "No interns yet. Import them from Airtable…" come with Phase 7.
- **Order:** active, then upcoming, completed and archived (as the design lists them), newest start first within each.
- **Status from the dates:** Upcoming (`neutral`) before the start, Active (`info`) through the end date, Completed (`success`) after it. **Archived** (`neutral`) isn't in the design; there's no archive button yet, as no screen has a place for one.
- **Subtitle:** "N batches · X active, Y upcoming", or for mentors "N batches assigned to you".
- **Batch page (A2):** the header (name, badge, "dates · Programme manager: Name"); Import comes in Phase 7, and Assign mentors in 6.6 (below). No summary strip and no tabs yet: Phase 7 adds them with Interns as the first tab. Then **"Mentors"** (A4's table: Mentor, Email, Assigned; the feedback columns come in Phase 8, Remove in 6.6) and **"Past members"** (not in the design: Member, Role, Assigned, Unassigned, in A4's style; hidden when empty).
- **Create batch (A9):** **admins only** (PRODUCT: an admin creates batches); the design also shows the button to PMs. The dates are native date inputs and the programme manager a native select, both styled as Kuat's Input and Select trigger. The list has active users with the Programme manager role. Picking a start fills an empty end date with start + 18 months. After creating, the new batch's page opens.
- **Empty states:** "No batches yet." (admin) and "You aren't assigned to any batches yet." (others). A batch that doesn't exist, or that you can't see, is "Page not found".

## Assign mentors (A11) and Remove (A4) as built in 6.6
- **Who manages a batch's mentors:** admins and the batch's current PM, while it isn't archived. They get **Assign mentors** (outline, `users` icon) in the batch header and **Remove** (ghost-muted `sm`, A4's 110px column) on the Mentors table. Mentors and other viewers see neither.
- **The dialog (560px)** is as designed: search, a bordered list (checkbox, avatar, name over email, load), "N selected", Cancel and Save mentors. **The list:** active users with the Mentor role, plus the batch's current mentors even if inactive (with the Inactive badge, so they can be removed). **Order:** the batch's mentors first, then the others, each by name, fixed while the dialog is open.
- **Load:** "2 active batches", "1 active, 1 upcoming", "1 upcoming batch" or "Unassigned", from the mentor's other current batches; completed and archived batches don't count. Other batches' names are never shown.
- **Saving sets the whole set at once:** if anyone can't be assigned, nothing changes and the reason shows in a Callout with the ticks kept. Save is disabled until something changes.
- **Remove unassigns at once, without asking:** it signs nobody out and is undone by assigning again; the mentor moves to Past members.
- **Not built: changing the programme manager.** The design has no place for it (6.6 decision 4); the API supports it. **Import from Airtable** comes with Phase 7.

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
