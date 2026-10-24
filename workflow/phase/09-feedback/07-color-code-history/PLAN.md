# 9.7 Color code history — Plan

**Phase:** 9 — Feedback
**Status:** Done

## Goal
The intern's color codes over time, as a trend strip or chart

## Done when
- **A6's side panel has v2's "Colour history" card** between "Colour code" and "Mentors", for any intern with at least one coloured feedback. It is hidden for an intern with no colour yet (v2's Zoya), while the feedback loads, and when the load fails (the timeline already shows that error).
- **The strip:** a 10px bar from the batch's start to today (decision 2), with 1px gaps between segments. Each segment is one colour, as wide as the days it lasted. A grey "No colour" segment comes first, until the first coloured feedback. Below it, v2's labels: the start ("6 Jul") on the left and **Today** on the right.
- **The chart:** v2's dot grid, at most the latest 4 columns (decision 3). There is one row per colour, Green at the top to Red at the bottom, with its label in a 104px column. There is one column per coloured feedback, oldest on the left, with a 10px dot in its colour's row and the day ("24 Jul") under it. A colour given again gets its own column, so a mentor who confirms Red shows up.
- **Data:** submitted and delivered feedback that has a colour, in submission order, from the feedback list the profile already loads (decision 1). Drafts and no-colour feedback are left out. Entries edited in 9.8 follow automatically.
- **Screen readers:** the strip and grid are hidden from them. A visually hidden list replaces both: "Yellow, 24 Jul 2026 · Orange, 18 Aug 2026 …".
- Web tests and a browser check pass; `pnpm check` passes.

## Decisions
**All accepted as recommended**; decision 3 then changed from 8 columns to 4 in the browser check (see REVIEW). v2 draws this card for two sample interns; these choices fill in what it doesn't show.

### (1) Where the history comes from
**Recommended:** **from the feedback list (`GET …/feedback`)** the Timeline already loads. It is unpaged and has each entry's colour and submission time, so there is **no API or schema work**. The intern's colour only changes through feedback (PRODUCT §8 rule 2), so the list is the full history.

### (2) The strip's start and end
v2's strip runs "6 Jul" (the batch's start) to "Today".
**Recommended:**
- **Start:** the batch's start date, for every intern, including one added late.
- **End:** today. For a Graduated, Terminated or Withdrawn intern, it ends on the day of that status change, and the right label shows that day ("8 Jan") instead of "Today". Without this, the last colour would keep growing after the internship ended.
- **Before the batch starts** (today earlier than the start), the strip is hidden, but the chart still shows.

### (3) Many coloured feedback entries
The panel is about 300px wide. **Recommended (accepted):** the chart shows the latest 8, and when there are more, a line under it says "Latest 8 of 12." The strip always covers the whole history, and the hidden list for screen readers has every entry.
**Changed while building:** 8 columns don't fit. At 20px each, the dates wrap into the dots, as the browser check showed. **The chart shows the latest 4**, which is what v2 draws, at about 40px each, with "Latest 4 of 12.".

### (4) Date labels under the chart
v2 uses "24 Jul" for Ishita and month names ("Oct", "Feb") for Meera, whose history crosses a year.
**Recommended:** always **"24 Jul"**, with the full date ("24 Jul 2026") as the column's tooltip and in the hidden list. Month names alone would merge two entries in the same month.

## Plan
- **`interns/profile/colour-history.ts`** (pure, tested):
  - `colourHistory(entries)`: the coloured, submitted entries in submission order as `{ code, on }`;
  - `stripSegments(history, start, end)`: `{ code | null, share }` from the days each colour lasted. The first segment is "No colour" when the first entry is after the start. Consecutive segments of the same colour merge. Days are counted in the viewer's time zone;
  - `historyEnd(intern, today)`: today, or the day of the final status change (decision 2);
  - `chartColumns(history, max = 4)`: the latest columns and the hidden count.
- **`interns/profile/colour-history-card.tsx`:** `PanelCard label="Colour history"`, the strip, the grid and the sr-only list. The dots use `colourTones`, and the "No colour" segment uses the `none` tone.
- **`interns/profile/side-panel.tsx`:** a `history` prop (the feedback list or `undefined`) and the card between the two existing ones. Its comment saying the history comes in 9.7 is dropped.
- **`pages/intern-page.tsx`:** passes the loaded list to `SidePanel`, and the batch's start.
- **`design/README.md`:** as-built notes under P6.

### Tests (Vitest)
- **Units:**
  - only submitted entries with a colour, ordered;
  - segment shares add up to 1, with a first "No colour" segment and same colours merged;
  - the end is the final status day;
  - 4 of 12 columns are shown, with 8 hidden;
  - the strip is hidden before the batch starts.
- **Component (stubApi):**
  - the card's rows and column dates;
  - the dot sits in the right row;
  - the same colour twice shows as two columns;
  - a draft and a no-colour entry are left out;
  - no card for an intern with no coloured feedback, or when the load fails;
  - "Latest 4 of 12.";
  - "8 Jan" instead of Today for a graduated intern;
  - the sr-only list.
- **Mutations** (on copies, restored with `cp`, checked with `cmp`), each of which must fail a test:
  - drafts counted;
  - segments sized evenly instead of by days;
  - the columns' dot placed in the wrong row (off by one);
  - the end always today.

### Browser check (Compose, headless Chrome, test users only, deleted afterwards)
A batch that started about 3 months ago, with an intern given Yellow, Orange, Borderline Red, Red and No colour across submissions (dates set through the database for test rows only). The card is checked against v2 P6 (strip widths, rows, dates). Also checked: no card for a fresh intern, and the card at the panel's width.

### Out of scope
- **Colour history on the batch page or roster** (A2's summary strip counts colours; not a history).
- **Mobile M6.**
- **Editing feedback** (9.8). The card already follows edits, since it reads the list.

### Steps
1. `colour-history.ts` and its tests.
2. The card, the side panel, the page; component tests.
3. `design/README.md`.
4. `pnpm check`, mutations, the browser check, `REVIEW.md`.

### Verification
- `pnpm check` exits 0; the mutations fail tests; screenshots match v2 P6's card apart from the decisions.
