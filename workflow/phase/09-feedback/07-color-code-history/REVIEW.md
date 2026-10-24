# 9.7 Color code history — Review

## What changed
| File | Notes |
|---|---|
| `apps/web/src/interns/profile/colour-history.ts` (+ test) | Pure helpers. **`colourHistory`:** the submitted feedback that has a colour, oldest first (drafts have no `submittedAt`). **`historyEnd`:** today, or the day of the final status change. **`stripSegments`:** each colour's share of the days from the batch's start, "No colour" first, a repeated colour merged, empty before the batch starts. **`chartColumns`:** the latest 4 and how many are hidden. |
| `apps/web/src/interns/profile/colour-history-card.tsx` | v2's **"Colour history"** card. **The strip:** 10px, 1px gaps, "6 Jul" … "Today" or the final day. **The dot grid:** Green → Red rows, 104px labels, 20px rows, 10px dots, the dates under it with the full date as a tooltip. "Latest 4 of N." when there are more. A hidden list for screen readers ("Yellow, 24 Jul 2026"), with the visuals `aria-hidden`. |
| `apps/web/src/interns/profile/side-panel.tsx` | The card between Colour code and Mentors, once there is coloured feedback. The side panel takes `feedback` and the batch's `startDate`. |
| `apps/web/src/pages/intern-page.tsx` | Passes the loaded feedback list to the side panel. |
| `design/README.md` | "Colour history (A6 side panel) as built in 9.7"; the 7.5 note now says the history is built. |

## How to verify
```sh
pnpm check     # contracts 76 + web 337 + api 618
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 76 + 337 (+13) + 618. Format and lint clean, with no suppressions; no new dependencies, `pnpm-workspace.yaml` unchanged. |
| Web tests (7 + 6) | **Dots:** each in its colour's row, and Red given twice as two columns. A draft and a no-colour entry are left out. **Strip:** widths by days from 6 Jul to today (18/25/25/26/16 of 110), the two Reds merged; "6 Jul" and "Today". **Screen readers:** the hidden list with every colour and full date. **Graduated:** ends "21 Oct", no "Today". **Many:** the latest 4 of 12, "Latest 4 of 12.", all 12 in the hidden list. **Left out** with no coloured feedback, or when the list fails to load (403). Units: ordering and filtering, shares, the first colour on day one, the empty strip before the start, the end day, the column cap. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught.** Unsubmitted feedback counted, by falling back to `updatedAt`: 4 tests failed. Segments sized evenly instead of by days: 1. Dots placed one row off: 1. The end always today: 2. A first try at the draft mutation (dropping `state !== 'draft'`) survived, because drafts never have `submittedAt`, so that check was redundant. It was removed, and the real guard was mutated instead. |
| **Browser** (Compose, headless Chrome, test users only, then deleted) | **Ishita** (Yellow 24 Jul, Orange 18 Aug, Borderline Red 12 Sep, Red 8 Oct, then no colour): the card at 300px between the other two. Strip segments 42/58/58/60/40px in REF-1's dot colours, 10px high. Rows 20px, labels 104px, dots 10px in the right rows, dates with full-date tooltips. It matches v2 P6's card. **Zoya** (no feedback): no card. **Meera** (graduated, backdated to 21 Oct): the strip ends "21 Oct". **8 coloured entries:** "Latest 4 of 8.", the labels side by side without wrapping. Cleanup: the test rows deleted, and only your account and its session remain; both triggers are enabled; Chrome stopped. |

## Decisions & trade-offs
- **Decisions 1, 2 and 4 as recommended.**
- **Decision 3 changed from 8 columns to 4.** In the browser, 8 columns leave about 20px each, and the dates wrap ("31 / Jul") into the dots. 4 columns is what v2 draws, and gives about 40px each. The strip and the hidden list still cover every entry.
- **The strip starts at the batch's start** for everyone, so a late joiner shows grey before joining.

## Deviations from plan
- Decision 3: at most 4 columns instead of 8 (above).
- `colourHistory` filters on `submittedAt` alone, since drafts never have one.

## Not done / follow-ups
- Mobile M6's side panel content.
- Once 9.8 lets authors edit feedback, the card follows the edit, because it reads the list.
