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
- **Add intern** (outline, `plus`) sits in the batch header before Assign mentors, for the batch's managers. A2's **Archive batch** comes with its task; **Import from Airtable** came in 8.5.
- **Email is required** (7.3 decision 1): the dialog marks it, unlike A14, because every intern has an email (DATA_MODEL).
- **Usernames are stored lower-cased** (decision 2), as A14's help text says.
- **The success sentence is "\<Name\> is on the roster as Active, with no colour code."** (decision 3): no pronoun, and nothing about features not built yet.

### Batch page and roster (A2, A3, M2, A4) as built in 7.4
- **Tabs:** **Interns** and **Mentors** (6.6's Mentors and Past members tables) (7.4 decision 1), with **Overview** first for the batch's admins and PM since 11.1. Notice tracker and Imports aren't built.
- **No feedback parts yet** (decision 2): cards have no "N feedback · date" or Give feedback, and their footer appears only for **Read-only**. The table has Intern, Colour code, Status and a Read-only column, without Feedback and Last feedback.
- **Filters:** one at a time (decision 3). Choosing the selected tag again goes back to All. The tab, view, filter and search are in the URL (`?tab=mentors&view=table&filter=red&q=ish`), with the defaults left out; typing a search replaces the history entry.
- **Order:** by name, ignoring case and accents; everything loads at once (decision 4).
- **Not yet** (decision 5): photos (initials only) and links to the profile, both since built (7.5, 7.7). The empty state for managers has v2's sentence and buttons since 8.5.
- **No results** for a filter without a search names the filter: "No interns match "Red"". v2 only draws the search case.
- **Kuat Tag in toggle mode** is full size (8px 10px, 14/21), so the 12 tags wrap to a second line at 1440px.

### Batch card counts (A1) as built in 7.8
- **Stats:** Interns, Mentors, On notice, Terminated; before anyone is added, Mentors only, with "No interns yet." in place of the colour bar.
- **The counts cover every intern, whatever their status** (7.8 decision 1), the same as the roster's All.
- **The colour bar leaves out empty codes** (decision 3), so the 2px gaps are only between real segments; the legend lists all seven codes, including zeros.
- **The Interns tab count on the batch page** comes from these counts, so it shows before the roster loads.

### Intern profile (P6 / M6, P22, P23, A6) as built in 7.5
- **At `/batches/:batchId/interns/:internId`**, with the crumbs Batches › \<batch\> › \<intern\>. Roster names link to it: only the name, so nothing interactive nests.
- **Left out until their tasks** (7.5 decision 1): Give feedback (9.5), the colour history (9.7) and "Linked feedback" (Phase 9).
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

### Photos (A6-photo) as built in 7.7
- **Admins and the batch's PM** (7.7 decision 1), when photos are on (`GET /settings`), and not for read-only interns or archived batches. The header reads `@username · batch · Add photo` (or Change photo).
- **Uploading:** the avatar at 40% with a 22px spinner. Under the line, a 240px column with "Uploading \<file\> · N%", a 6px bar (a native `progress` styled as Kuat Progress) and a ghost-muted Cancel. The button is hidden meanwhile.
- **Error:** v2's line for a wrong type or size. A failed save says "\<file\> wasn't uploaded." with the API's reason.
- **Photos show on the card (48px), the table row (28px) and the profile (64px).** Initials stand in when there's none, or when the image fails to load.

### Edit details (A15) as built in 7.9
- **An outline `sm` Edit details** at the right of the Details card's header, for admins and the batch's PM, not on a read-only intern or an archived batch (7.9 decision 1).
- **The dialog shares A14's fields** (`interns/intern-fields.tsx`). Username is disabled (Kuat's disabled Input: `--muted` at 60%) with "Usernames can't change because imports match on them."; the rest are filled in from the profile. **Save details** ("Saving…"). A blank optional field clears it (decision 3).
- **The email error stays "Invalid email address"** (decision 2), as on every other form, rather than A15's "Enter a valid email address."

### Markdown editor (A7's Feedback field) as built in 9.4
- **`ui/markdown-editor.tsx`:** Write / Preview tabs, then "Markdown" and v2's six 30px buttons (Bold, Italic, Heading, Bulleted list, Code, Link), each named and with a tooltip. **Ctrl/⌘+B** and **Ctrl/⌘+I** too. Buttons are off on Preview and when the field is disabled.
- **What the buttons do:** Bold `**…**` and Italic `_…_` (toggles), Heading `### ` and List `- ` on each selected line (toggles), Code `` `…` `` or a fenced block over several lines, Link `[…](url)` with `url` selected. Undo keeps them (the browser's `insertText`).
- **Preview** uses the sanitized renderer in a bordered box; **an empty field says "Nothing to preview yet."** (not drawn in v2).
- **Images in Markdown render as links** (9.4 decision 2): nothing is fetched until someone clicks.

### Give feedback (A7) as built in 9.5
- **Where** (9.5 decision 1): **Give feedback** (primary, `message-square`) in the profile header after the status buttons, and in the empty timeline. The batch's PM and current mentors only; **not an admin who is neither**, not in an archived batch, not for a read-only intern. **Roster cards and rows don't have it yet:** it comes with the feedback counts beside it.
- **Feedback period:** today's month (UTC, as the API checks) back to the batch's start month, newest first, the current one chosen (decision 3). **A batch that hasn't started** offers only its first month, says "This batch starts in \<month\>." and turns both save buttons off (not in v2).
- **Notice:** v2's box and Kuat Switch; "Starts a one-month notice when you submit.", on: "Ends \<a month from today\>. \<PM\> then lifts it or terminates. Nothing happens automatically." (Ember tint), or off and "\<first name\> is already on notice until \<date\>.". **Switching it on chooses Red; off leaves the colour** (decision 2).
- **Colour code:** v2's seven rows (native radios, so the arrow keys move between them), the chosen row tinted. Under it v2's "Current code: … can’t go back to no colour.", or for an intern without a code **"No colour yet. Set by the first coloured feedback."** (the side panel's words; v2 doesn't show this case).
- **Errors:** "Write your feedback before submitting." on **Submit only** (a draft may be blank), focus on the field. A refusal shows "We couldn't submit your feedback" (or "save your draft"), "Your text is still here. Try again in a moment." and the API's detail, at the top of the fields, which scroll back to it.
- **Scrolling:** the fields scroll and the buttons stay in view, as v2's `calc(100vh - 220px)`, but 240px so the dialog itself doesn't scroll as well.
- **Cancel** closes without asking (decision 4). The same dialog opens an existing draft (for 9.6).

### Feedback on the timeline (P6, A26) as built in 9.6
- **Feedback and the viewer's own drafts** (9.6 decision 1). Conversations joined in 10.3, comments in 10.5, and status changes and paging in 10.6.
- **v2's rail** (32px: `message-square` on ee-blue-50 for feedback, `pen-line` on slate-100 for a draft) with the line down to the next entry; none after the last.
- **The feedback card:** "\<author\> gave feedback · \<day\> · period Oct 2026" (the day in the viewer's time zone) and **Awaiting delivery** / **Delivered** (no date until Phase 10 records conversations). The colours: previous → new; **a first colour alone**; "No colour · Colour code unchanged"; **the same colour again as one chip with "Colour code unchanged"** (decision 2). **Notice** badge when it gave notice. The text through the sanitized renderer.
- **The draft card:** "Your draft · only you can see this · edited 23 Oct", Draft, a plain-text excerpt (about 160 characters; **"No text yet."** for a blank draft, not in v2), **Continue editing** (opens A7 on the draft) and **Discard** (A26). **No buttons when the viewer can't write feedback there any more** (archived, read-only, no longer a mentor; decision 3).
- **The side panel** says "From the latest coloured feedback, 8 Oct 2026." (decision 4).
- **Editing submitted feedback** is task 9.8 (decision 5).

### Editing submitted feedback (A7, P6) as built in 9.8 — not in v2
- **Edit** (ghost-muted, sm, `pencil`) at the bottom left of the viewer's own Awaiting-delivery cards, when they can still write feedback in the batch and the intern isn't read-only.
- **A7 in edit mode:** "Edit feedback for \<name\>", "Visible to all mentors in \<batch\>. Saving marks it as edited.", filled in, with **Cancel** and **Save changes** (no Save draft). A refusal reads "We couldn't save your changes".
- **The colour help** reads "Current code: Red. The code follows the newest coloured feedback, so changing an older one leaves it."
- **The notice switch:**
  - without notice, "Starts a one-month notice when you save.";
  - with its own notice running, "Runs until \<date\>. Switching it off withdraws it." (off: "Saving withdraws the notice this feedback gave.");
  - once that notice was lifted or replaced, it is **locked on**, with "This notice was lifted on \<date\>, so it can't be withdrawn here." or "A later notice replaced this one." (decision 2).
- **"· edited"** ends the card's header once its author changed it (decision 3; v2 marks edited comments this way).
- **The previous colour** in each card's chip is the colour of the coloured feedback before it, worked out when read (decision 1), so editing an older entry updates the next card's chip.

### Colour history (A6 side panel) as built in 9.7
- **Between Colour code and Mentors**, only once the intern has coloured feedback (v2 hides it for Zoya), and not while the feedback loads or after it fails to load. Built from the feedback list: no API of its own (9.7 decision 1).
- **The strip:** v2's 10px bar with 1px gaps, each colour as wide as the days it lasted, grey "No colour" before the first coloured feedback, a colour given again merged into one run. **From the batch's start to today, or to the day the intern graduated, was terminated or withdrew** (that day replaces "Today"); hidden before the batch starts (decision 2).
- **The chart:** v2's rows Green → Red (104px labels, 20px rows, 10px dots), one column per coloured feedback, a colour given again in its own column. **At most the latest 4 columns** with "Latest 4 of N." under them (decision 3): v2 draws 4, and more make the dates wrap into the dots at 300px.
- **Dates:** always "24 Jul", with the full date as the tooltip (decision 4; v2 uses month names for Meera).
- **Screen readers** get a hidden list ("Yellow, 24 Jul 2026", every entry); the strip and chart are hidden from them.

### Conversations (A8, P6) as built in 10.3
- **Record conversation** (outline, sm) sits on each **Awaiting delivery** card, for the batch's PM only, on a record that isn't read-only, in a batch that isn't archived. v2 puts it on A24 and P26, which wait for Phase 11 (10.3 decision 1). It opens A8 with that feedback chosen.
- **A8 as drawn:**
  - 560px, with the description "\<intern\> · 2 submitted feedback awaiting delivery.";
  - **Feedback delivered:** radio cards ("\<author\> · submitted 22 Oct 2026", the colour chip, a one-line excerpt; the chosen one ee-blue-50 with a primary border), with the help "Choose the feedback you went through in the 1:1.";
  - **Date delivered** (the UTC date by default) beside **Delivered by** (disabled);
  - **Conversation notes** in **the Markdown editor A7 uses** (decision 4; v2 draws a plain monospace textarea);
  - **Cancel** and **Save conversation**.
- **A8's other states:** **A8-empty** "No feedback is waiting to be delivered"; **A8-servererror** "We couldn't save the conversation" with the API's sentence, for example "This feedback has already been delivered.".
- **The conversation entry** (decision 2):
  - a teal rail with `circle-check-big`;
  - a slate-50 card: "\<PM\> recorded a conversation · 10 Oct 2026" (with "· edited"), "Delivers \<Author\>’s feedback (8 Oct)" linking to that card, and the notes as Markdown;
  - mixed newest first with feedback by day, a conversation first on its day.

  Delivered feedback shows **Delivered 10 Oct**.
- **Editing** (decision 3, not in v2): the PM's **Edit** (ghost-muted, sm, `pencil`) on the card opens A8 as **Edit conversation**. The delivered feedback is one fixed card ("The feedback a conversation delivered can't change."), with **Save changes**.

### Comments (P6) as built in 10.5
- **Comments are timeline entries,** as v2 desktop draws them (10.5 decision 1), not a thread inside the card (MM5, mobile):
  - a `message-circle` rail on slate-100;
  - "\<author\> commented on **\<Author\>’s feedback (22 Oct)**" or "**\<PM\>’s conversation (10 Oct)**", linking to that card, then "· 23 Oct 2026" and "· edited";
  - the text as plain text with its line breaks, or "This comment was deleted." in muted italics;
  - newest first by the day written; on the same day a comment comes before what it follows.
- **The card's foot is one row:** the card's own buttons (the author's **Edit**, the PM's **Record conversation**), **Comment** (ghost, sm), then the count. The count reads "No comments", "1 comment above" or "3 comments above", deleted comments included. v2 writes "below", but a comment always sits above its card on a newest-first timeline (decision 2).
- **The composer** (v2): Comment opens "Add a comment" (Input) and a **secondary** Comment, with focus in the Input. Enter or the button posts, and posting closes it. "Write a comment." is shown when the text is blank; a refusal shows the API's sentence there and keeps the text. Escape closes it.
- **Who:** the batch's current mentors and PM (an admin only when assigned), not in an archived batch or on a read-only record (decision 3). The comments still show there.
- **Conversation cards** have the same row (decision 5; v2 draws none).
- **Edit and Delete** (ghost-muted, sm) appear on your own live comments only; v2 draws the buttons but neither flow (decision 4):
  - **Edit** puts the text in place in a **Textarea**, so a comment's line breaks survive. **Save** (secondary, sm) and **Cancel** (ghost-muted, sm) follow. Saving unchanged text sends nothing.
  - **Delete** asks first, in a 460px dialog: "Delete this comment?", "It will show as “This comment was deleted.” to everyone in the batch.", **Cancel** and a destructive **Delete**.
- **If the comments fail to load,** "We couldn't load the comments" is shown and the rest of the timeline stays.

### The unified timeline (P6) as built in 10.6
- **Status changes are entries** (v2 P6):
  - a `clock` rail on equal-ember-50;
  - "**Status changed** [From] → [To] · \<who\> · 8 Oct 2026", with the Status history tab's badges;
  - the stored reason underneath in 13px muted Markdown, with " Runs until 8 Nov 2026." when it starts a notice (10.6 decision 2; v2 words it "Started by feedback marked as notice.").
- **Onboarding** ("→ Active") stays in Status history only (decision 1). "No feedback yet" shows when there's no feedback and no other status change.
- **Order:** drafts first, then newest first by day. On the same day: comments, then status changes, then conversations, then feedback, so a notice sits just above the feedback that gave it.
- **"Show earlier activity (N)"** (outline, sm, indented 46px):
  - 10 entries at first, then 10 more per click, worked out in the browser (decision 3);
  - drafts aren't counted, and N is what's still hidden.
- **A link to a hidden entry** (a comment's, or a conversation's "Delivers …") shows everything down to that entry before the browser jumps to it (decision 4).

### Overview (A24 / P24) as built in 11.1
- **The tab** is listed first, for admins and the batch's PM, archived or not (it only reads), but **Interns stays the default** (11.1 decision 1). Mentors don't get it, and `?tab=overview` opens their roster. `GET /batches/:id/overview` is open to anyone who can see the batch (decision 5).
- **Colour distribution:**
  - "6 current interns, including 3 on notice. Excludes terminated and withdrawn.";
  - v2's 16px bar of segments with 2px gaps (the colours present only);
  - two columns of rows: dot and label (150px), a bar against the largest count, the count (600) and the percentage;
  - "No current interns yet." with no bar.
- **On notice:**
  - rows soonest ending first: avatar, the name (linking to the profile), "Ends 3 Nov 2026 · issued by Vikram Shetty" (who made the change to On notice);
  - "**5 days left**" in red-700 at 7 or fewer days, or a warning **Decision needed** once it has ended (the profile banner's count);
  - "No one is on notice." when empty;
  - **no Notice tracker button**, since P5 isn't built (decision 2).
- **Feedback to deliver:**
  - "5 submitted" in the header; rows newest first with avatar, name, "From Anjali Deshpande · 29 Oct 2026 · waiting today / 1 day / 5 days" (UTC days) and the colour chip;
  - **only for interns whose record can change** (a read-only intern's feedback can't be delivered);
  - "No feedback is waiting to be delivered." when empty.
- **Record conversation** (outline, sm) is on each row for the batch's PM, not in an archived batch. It opens A8 on this page with that feedback chosen, and saving refreshes the overview, so the row goes (decision 4).
- **Loading:** Skeletons in the cards' shapes. **A failed load:** "We couldn't load the overview".

### My pending (M26 / P26) as built in 11.2
- **The sidebar's "My pending"** (`inbox`) sits under Batches for everyone signed in, admins included. Its Kuat CounterBadge counts **To deliver** for anyone holding the PM role and **Needs feedback** for everyone else (decision 2). There's no badge at 0, and the link reads "My pending (4)" to screen readers.
- **The page** (`/pending`, crumb "My pending") has v2's title and the role's subtitle. Its tabs are **To deliver / Needs feedback / Drafts** for a PM and **Needs feedback / Drafts** for anyone else, with counts. The first tab is the default, and `?tab=` keeps the others (a mentor's `?tab=deliver` opens Needs feedback).
- **What's listed** (`GET /me/pending`): the batches you currently mentor or run, started and not archived, and only interns whose record can still change. An admin assigned nowhere sees empty lists.
- **Needs feedback:**
  - interns without **your** submitted feedback for this month (UTC). Your draft doesn't count, and another mentor's feedback doesn't clear them (decision 1);
  - v2's table: Intern (avatar and name, linking to the profile), Batch, Colour code chip, and Last feedback ("18 Sep 2026 · Sana Qureshi", "· you", or "No feedback yet"), from anyone;
  - **Give feedback** (ghost, sm) opens A7 here, **on your draft for that intern if you have one** (decision 5);
  - the footer counts the rows ("12 interns") instead of v2's "Showing 8 of 12" (decision 3);
  - empty, it reads "You're up to date" / "Every intern in your batches has feedback from you for October 2026.".
- **Drafts** are v2's dashed cards: avatar, name, "\<batch\> · period Oct 2026 · edited 23 Oct", the chip, then a one-line excerpt ("No text yet." when blank), with **Continue** (outline, A7 on the draft) and **Discard** (ghost-muted, A26). Empty, it says "No drafts." (decision 4).
- **To deliver** is v2's table: Intern, Feedback by, Submitted, Colour code, and Waiting ("today", "1 day", "5 days", in UTC days), newest first. **Record conversation** (outline, sm) opens A8 here with that feedback chosen. Empty, it says "No feedback is waiting to be delivered."
- **The button columns** are v2's widths plus the cell padding, so the buttons stay inside the table.
- **Refreshing:** giving feedback, saving or discarding a draft, recording a conversation and changing a status all refresh the lists and the badge, wherever they happen.
- **Loading:** Skeletons. **A failed load:** "We couldn't load your pending work".

### Import from Airtable (A10) as built in 8.5
- **Where:** an outline **Import from Airtable** (`download`) between Add intern and Assign mentors, and as the primary button in the managers' empty roster ("Import interns from Airtable, or add them one at a time.", then Add intern). Admins and the batch's PM only, not on an archived batch.
- **A Base ID field** (8.5 decision 1, asked for in 8.1): the API key on its own row, then **Base ID and Table ID side by side** (mono, "Starts with “app”." / "Starts with “tbl”."), then View name full width. The key is a password field with autocomplete off; it lives only in the dialog and is gone once it closes.
- **Source errors** come from the shared contract, without v2's closing full stop, like every other form: "Enter an API key", "Base IDs start with “app”", "Table IDs start with “tbl”", "Enter a view name". Airtable's refusal shows "We couldn't connect to Airtable" with the API's sentence.
- **Importing** (decision 2): the spinner and "Importing N interns", **without v2's progress bar or its import-history sentence** (the import is one request, and A25 isn't built). Close stays; the import carries on.
- **Result** (decision 3): **no "View import history"** until A25. "Skipped rows weren't changed." only when something was skipped.
- **Nothing to import** (decision 4, not in v2): the preview shows with **Import 0 interns** disabled, and focus on Back.
- **Invalid rows** list every reason on its own line. Failed: "Import failed" with the API's sentence and "Nothing was saved.", then Back (to the preview) and Try again.

### Import fields (A10) as built in 8.6 — not in v2
- **A Fields step between Source and Preview** (8.6 decision 1): the steps read Source → Fields → Preview → Result, and Source's button is **Next** ("Reading the view…"). Built from Kuat's Field and Select only: a 160px label column (with Kuat's red "*" for Username, Name and Email) and a native Select per intern field, gap 12.
- **The options** are the view's columns, first seen first. **Username** also offers "From the email (before @)" (decision 2). Optional fields offer "Not imported". Required ones start on "Choose a column" when nothing fits.
- **Pre-filled** from the batch's saved mapping, else the latest any batch saved, else the defaults (decision 4). A saved column the view no longer has leaves the field unset, with "“\<column\>” isn't in this view." under it.
- **Preview import** with a required field unset shows "Choose a column." under each such field, and focus goes to the first. The API's refusal shows as "We couldn't preview the import" with its sentence. **A view with no records** shows "This view has no records" and only Back.
- **The intro line:** "Match the view's columns to intern fields. They're saved for \<batch\> when you import." The dialog's description now says "Interns are matched by their Airtable record or username" (v2 says "by username").
- **Back** from the preview returns to Fields with the choices kept, and Back from Fields returns to Source with what was typed.

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
