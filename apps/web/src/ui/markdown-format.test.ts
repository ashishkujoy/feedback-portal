import { describe, expect, it } from 'vitest';
import { applyChange, type FormatAction, formatChange, type Selection } from './markdown-format.ts';

/** Text with the selection written in: `«…»` for a selection, `‸` for the cursor. */
const parse = (marked: string): Selection => {
  const cursor = marked.indexOf('‸');
  if (cursor !== -1) return { text: marked.replace('‸', ''), start: cursor, end: cursor };
  const start = marked.indexOf('«');
  const end = marked.indexOf('»') - 1;
  return { text: marked.replace('«', '').replace('»', ''), start, end };
};

const show = ({ text, start, end }: Selection): string =>
  start === end
    ? `${text.slice(0, start)}‸${text.slice(start)}`
    : `${text.slice(0, start)}«${text.slice(start, end)}»${text.slice(end)}`;

/** Applies `action` to the marked text and writes the result the same way. */
const format = (action: FormatAction, marked: string): string => {
  const selection = parse(marked);
  const change = formatChange(action, selection);
  return show({
    text: applyChange(selection.text, change),
    start: change.selectionStart,
    end: change.selectionEnd,
  });
};

describe('bold and italic', () => {
  it('wraps the selection and keeps it selected', () => {
    expect(format('bold', 'Closed «PAY-214» today')).toBe('Closed **«PAY-214»** today');
    expect(format('italic', 'Closed «PAY-214» today')).toBe('Closed _«PAY-214»_ today');
  });

  it('puts the cursor between the markers with no selection', () => {
    expect(format('bold', 'Closed ‸')).toBe('Closed **‸**');
    expect(format('italic', '‸')).toBe('_‸_');
  });

  it('toggles off, whether or not the selection includes the markers', () => {
    expect(format('bold', 'Closed **«PAY-214»** today')).toBe('Closed «PAY-214» today');
    expect(format('bold', 'Closed «**PAY-214**» today')).toBe('Closed «PAY-214» today');
    expect(format('italic', '_«x»_')).toBe('«x»');
    expect(format('bold', '**‸**')).toBe('‸');
  });

  it('applies bold and italic together', () => {
    expect(format('italic', '**«x»**')).toBe('**_«x»_**');
  });
});

describe('heading and bulleted list', () => {
  it("prefixes the cursor's line and moves the cursor with its text", () => {
    expect(format('heading', 'Intro\nSumm‸ary\nEnd')).toBe('Intro\n### Summ‸ary\nEnd');
    expect(format('list', 'One\nTw‸o')).toBe('One\n- Tw‸o');
    expect(format('list', '‸')).toBe('- ‸');
  });

  it('prefixes every selected line, skipping blank ones', () => {
    expect(format('list', '«Pairs often\n\nAsks early»')).toBe('«- Pairs often\n\n- Asks early»');
    expect(format('list', 'Keep:\nPai«rs often\nAsks ea»rly\nDone')).toBe(
      'Keep:\n«- Pairs often\n- Asks early»\nDone',
    );
  });

  it("doesn't take in the next line when the selection ends at a line break", () => {
    expect(format('list', '«One\n»Two')).toBe('«- One»\nTwo');
  });

  it('removes the prefix when every line has it', () => {
    expect(format('list', '«- One\n- Two»')).toBe('«One\nTwo»');
    expect(format('heading', '### Summ‸ary')).toBe('Summ‸ary');
    // Not every line has it, so it's added to the one that doesn't.
    expect(format('list', '«- One\nTwo»')).toBe('«- One\n- Two»');
  });
});

describe('code', () => {
  it('wraps part of a line in backticks, and toggles off', () => {
    expect(format('code', 'Used «reduce» here')).toBe('Used `«reduce»` here');
    expect(format('code', 'Used `«reduce»` here')).toBe('Used «reduce» here');
    expect(format('code', '‸')).toBe('`‸`');
  });

  it('fences a selection over several lines', () => {
    expect(format('code', '«const a = 1;\nconst b = 2;»')).toBe(
      '```\n«const a = 1;\nconst b = 2;»\n```',
    );
  });
});

describe('link', () => {
  it('links the selection and selects the address to type over', () => {
    expect(format('link', 'See «the repo» now')).toBe('See [the repo](«url») now');
  });

  it('puts the cursor in the brackets with no selection', () => {
    expect(format('link', 'See ‸')).toBe('See [‸](url)');
  });
});
