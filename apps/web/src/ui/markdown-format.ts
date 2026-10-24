/** The editor's toolbar actions (v2 A7), in the order the toolbar shows them. */
export type FormatAction = 'bold' | 'italic' | 'heading' | 'list' | 'code' | 'link';

/** The text and what's selected in it. */
export type Selection = Readonly<{ text: string; start: number; end: number }>;

/**
 * One edit: replace `[from, to)` of the old text with `insert`, then select
 * `[selectionStart, selectionEnd)` of the new text. A replacement (not a whole new text) so the
 * editor can insert it as typing would, keeping the browser's undo history (9.4 decision 3).
 */
export type Change = Readonly<{
  from: number;
  to: number;
  insert: string;
  selectionStart: number;
  selectionEnd: number;
}>;

/** The text after `change`. */
export const applyChange = (text: string, { from, to, insert }: Change): string =>
  text.slice(0, from) + insert + text.slice(to);

/** Wraps the selection in `marker`, or unwraps it when it's already wrapped (a toggle). */
const wrap = ({ text, start, end }: Selection, marker: string): Change => {
  const selected = text.slice(start, end);
  const size = marker.length;
  // Already wrapped around the selection: `**|bold|**`.
  if (text.slice(start - size, start) === marker && text.slice(end, end + size) === marker) {
    return {
      from: start - size,
      to: end + size,
      insert: selected,
      selectionStart: start - size,
      selectionEnd: end - size,
    };
  }
  // The selection includes the markers: `|**bold**|`.
  if (selected.length >= size * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(size, -size);
    return {
      from: start,
      to: end,
      insert: inner,
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }
  return {
    from: start,
    to: end,
    insert: `${marker}${selected}${marker}`,
    selectionStart: start + size,
    selectionEnd: end + size,
  };
};

/**
 * Starts each selected line with `prefix` (lines that have it keep one), or removes it when
 * every non-blank line already has it. Without a selection, only the cursor's line changes and the cursor moves with its text.
 */
const prefixLines = ({ text, start, end }: Selection, prefix: string): Change => {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  // A selection ending just after a line break doesn't take in the next line.
  const last = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const lineEnd = text.indexOf('\n', last);
  const to = lineEnd === -1 ? text.length : lineEnd;
  const lines = text.slice(from, to).split('\n');
  const written = lines.filter((line) => line.trim() !== '');
  const remove = written.length > 0 && written.every((line) => line.startsWith(prefix));
  const changed = lines.map((line) => {
    if (remove) return line.startsWith(prefix) ? line.slice(prefix.length) : line;
    // Lines that have it keep it; blank lines in a selection stay blank, but a lone empty line
    // gets the prefix to start typing.
    if (line.startsWith(prefix) || (line.trim() === '' && lines.length > 1)) return line;
    return `${prefix}${line}`;
  });
  const insert = changed.join('\n');
  if (start === end) {
    const shift = remove ? -prefix.length : prefix.length;
    const cursor = Math.max(from, start + shift);
    return { from, to, insert, selectionStart: cursor, selectionEnd: cursor };
  }
  return { from, to, insert, selectionStart: from, selectionEnd: from + insert.length };
};

/** Inline code for part of a line; a fenced block when the selection spans lines. */
const code = (selection: Selection): Change => {
  const { text, start, end } = selection;
  const selected = text.slice(start, end);
  if (!selected.includes('\n')) return wrap(selection, '`');
  const fence = '```\n';
  return {
    from: start,
    to: end,
    insert: `${fence}${selected}\n\`\`\``,
    selectionStart: start + fence.length,
    selectionEnd: start + fence.length + selected.length,
  };
};

const urlPlaceholder = 'url';

/** `[selection](url)` with `url` selected to type over; without a selection, the cursor in `[]`. */
const link = ({ text, start, end }: Selection): Change => {
  const selected = text.slice(start, end);
  const insert = `[${selected}](${urlPlaceholder})`;
  if (start === end) {
    return { from: start, to: end, insert, selectionStart: start + 1, selectionEnd: start + 1 };
  }
  const url = start + selected.length + 3;
  return {
    from: start,
    to: end,
    insert,
    selectionStart: url,
    selectionEnd: url + urlPlaceholder.length,
  };
};

/** What a toolbar button (or Ctrl/⌘+B, Ctrl/⌘+I) does to the text (9.4's table). */
export const formatChange = (action: FormatAction, selection: Selection): Change => {
  switch (action) {
    case 'bold':
      return wrap(selection, '**');
    case 'italic':
      return wrap(selection, '_');
    case 'heading':
      return prefixLines(selection, '### ');
    case 'list':
      return prefixLines(selection, '- ');
    case 'code':
      return code(selection);
    case 'link':
      return link(selection);
  }
};
