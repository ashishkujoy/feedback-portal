import type { FeedbackView } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import {
  colourChange,
  dayAndMonth,
  excerpt,
  feedbackLine,
  latestColouredOn,
  shortPeriod,
  stateBadge,
} from './feedback-entry.ts';

const entry = (overrides: Partial<FeedbackView> = {}): FeedbackView => ({
  id: '01890a5d-ac96-774b-bcce-b30209000003',
  internId: '01890a5d-ac96-774b-bcce-b30209000002',
  period: '2026-10-01',
  body: 'Text',
  colorCode: null,
  previousColorCode: null,
  givesNotice: false,
  state: 'submitted',
  author: { id: '01890a5d-ac96-774b-bcce-b30209000004', name: 'Pat Lee', avatarUrl: null },
  conversationId: null,
  submittedAt: '2026-10-08T12:00:00.000Z',
  createdAt: '2026-10-08T12:00:00.000Z',
  updatedAt: '2026-10-08T12:00:00.000Z',
  editedAt: null,
  ...overrides,
});

describe('a feedback entry', () => {
  it('has the header line: the submission day where the viewer is, and the period', () => {
    expect(feedbackLine(entry())).toBe('gave feedback · 8 Oct 2026 · period Oct 2026');
    expect(shortPeriod('2027-01-01')).toBe('Jan 2027');
    expect(dayAndMonth(new Date(2026, 9, 23, 23, 30).toISOString())).toBe('23 Oct');
  });

  it('shows the colour change: from → to, a first colour alone, and unchanged', () => {
    expect(colourChange(entry({ colorCode: 'red', previousColorCode: 'borderline_red' }))).toEqual({
      kind: 'changed',
      from: 'borderline_red',
      to: 'red',
    });
    expect(colourChange(entry({ colorCode: 'yellow' }))).toEqual({ kind: 'first', to: 'yellow' });
    expect(colourChange(entry())).toEqual({ kind: 'unchanged', code: null });
    // The same colour again isn't "Red → Red" (9.6 decision 2).
    expect(colourChange(entry({ colorCode: 'red', previousColorCode: 'red' }))).toEqual({
      kind: 'unchanged',
      code: 'red',
    });
  });

  it('is awaiting delivery until delivered', () => {
    expect(stateBadge(entry())).toEqual({ type: 'info', label: 'Awaiting delivery' });
    expect(stateBadge(entry({ state: 'delivered' }))).toEqual({
      type: 'success',
      label: 'Delivered',
    });
  });
});

describe('a draft excerpt', () => {
  it('drops the Markdown and joins the lines', () => {
    expect(
      excerpt('### Summary\n- **Pairs** often\n- Closed `PAY-214`\n\nSee [the PR](https://x.test)'),
    ).toBe('Summary Pairs often Closed PAY-214 See the PR');
  });

  it('cuts long text at a word', () => {
    const long = `${'word '.repeat(40)}end`;
    const cut = excerpt(long);
    expect(cut.endsWith('word…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(161);
  });
});

describe('the latest coloured feedback', () => {
  it('is the newest submitted entry with a colour, ignoring drafts and no-colour entries', () => {
    expect(
      latestColouredOn([
        entry({ state: 'draft', colorCode: 'green', submittedAt: null }),
        entry({ colorCode: null, submittedAt: '2026-10-22T12:00:00.000Z' }),
        entry({ colorCode: 'red', submittedAt: '2026-10-08T12:00:00.000Z' }),
        entry({ colorCode: 'orange', submittedAt: '2026-09-12T12:00:00.000Z' }),
      ]),
    ).toBe('8 Oct 2026');
    expect(latestColouredOn([entry()])).toBeNull();
  });
});
