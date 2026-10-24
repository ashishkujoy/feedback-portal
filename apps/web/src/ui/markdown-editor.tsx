import { Code, Heading1, Link, List } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Markdown } from './markdown.tsx';
import { applyChange, type Change, type FormatAction, formatChange } from './markdown-format.ts';
import { Textarea } from './textarea.tsx';

type Mode = 'write' | 'preview';

const modes: readonly Readonly<{ value: Mode; label: string }>[] = [
  { value: 'write', label: 'Write' },
  { value: 'preview', label: 'Preview' },
];

const icon = (Icon: typeof Code) => <Icon aria-hidden size={16} strokeWidth={2} />;

/** v2 A7's toolbar, in its order; "B" and "I" are letters, the rest Lucide icons. */
const tools: readonly Readonly<{ action: FormatAction; label: string; face: ReactNode }>[] = [
  { action: 'bold', label: 'Bold', face: <span className="text-sm font-bold">B</span> },
  {
    action: 'italic',
    label: 'Italic',
    face: <span className="font-[Georgia,serif] text-sm italic">I</span>,
  },
  { action: 'heading', label: 'Heading', face: icon(Heading1) },
  { action: 'list', label: 'Bulleted list', face: icon(List) },
  { action: 'code', label: 'Code', face: icon(Code) },
  { action: 'link', label: 'Link', face: icon(Link) },
];

/** Ctrl/⌘+B and Ctrl/⌘+I in the textarea. */
const shortcuts: Readonly<Record<string, FormatAction>> = { b: 'bold', i: 'italic' };

/**
 * Applies `change` as typing would, so the browser's undo history keeps it (9.4 decision 3).
 * Returns `false` where the editing command isn't available (test environments).
 */
const insertAsTyping = (textarea: HTMLTextAreaElement, change: Change): boolean => {
  textarea.setSelectionRange(change.from, change.to);
  // `execCommand` is deprecated but is still the only way to edit a textarea with undo.
  return typeof document.execCommand === 'function'
    ? document.execCommand('insertText', false, change.insert)
    : false;
};

type MarkdownEditorProps = Readonly<{
  /** The textarea's id, for the Field's label. */
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  rows?: number;
  'aria-describedby'?: string | undefined;
  'aria-required'?: boolean;
  /** The textarea, e.g. for React Hook Form to focus it on an error. */
  ref?: Ref<HTMLTextAreaElement>;
}>;

/**
 * v2 A7's Markdown field: Write / Preview tabs, then "Markdown" and the formatting toolbar.
 * Controlled (`value`, `onChange`), so a form binds it with React Hook Form's `Controller`.
 * Preview renders with the sanitized `Markdown`.
 */
export const MarkdownEditor = ({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  invalid = false,
  disabled = false,
  rows = 6,
  'aria-describedby': describedBy,
  'aria-required': required,
  ref,
}: MarkdownEditorProps) => {
  const [mode, setMode] = useState<Mode>('write');
  const textarea = useRef<HTMLTextAreaElement>(null);
  // The selection to restore once a change set from code has rendered.
  const pending = useRef<Readonly<{ start: number; end: number }> | null>(null);
  const tabsId = useId();
  const tabId = (tab: Mode) => `${tabsId}-${tab}`;
  const panelId = `${tabsId}-panel`;

  useLayoutEffect(() => {
    const element = textarea.current;
    if (!pending.current || !element) return;
    element.setSelectionRange(pending.current.start, pending.current.end);
    pending.current = null;
  });

  const setTextarea = (element: HTMLTextAreaElement | null) => {
    textarea.current = element;
    if (typeof ref === 'function') ref(element);
    else if (ref) ref.current = element;
  };

  const apply = (action: FormatAction) => {
    const element = textarea.current;
    if (!element) return;
    const change = formatChange(action, {
      text: element.value,
      start: element.selectionStart,
      end: element.selectionEnd,
    });
    element.focus();
    if (insertAsTyping(element, change)) {
      element.setSelectionRange(change.selectionStart, change.selectionEnd);
      return;
    }
    pending.current = { start: change.selectionStart, end: change.selectionEnd };
    onChange(applyChange(element.value, change));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const action = shortcuts[event.key.toLowerCase()];
    if (!action || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    event.preventDefault();
    apply(action);
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: Mode = mode === 'write' ? 'preview' : 'write';
    setMode(next);
    document.getElementById(tabId(next))?.focus();
  };

  const toolbarOff = disabled || mode === 'preview';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Write or preview"
          className="flex gap-0.5 border-b border-border"
        >
          {modes.map((tab) => {
            const selected = mode === tab.value;
            return (
              <button
                key={tab.value}
                id={tabId(tab.value)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => setMode(tab.value)}
                onKeyDown={onTabKeyDown}
                className={`-mb-px cursor-pointer border-b-2 px-2.5 py-1.5 text-[13px] font-medium focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)] focus-visible:outline-none ${selected ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div
          role="toolbar"
          aria-label="Formatting"
          className="flex items-center gap-0.5 text-muted-foreground"
        >
          <span className="pr-1.5 text-xs">Markdown</span>
          {tools.map((tool) => (
            <button
              key={tool.action}
              type="button"
              aria-label={tool.label}
              title={tool.label}
              disabled={toolbarOff}
              // Keeps the textarea's selection: the click mustn't move focus first.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => apply(tool.action)}
              className="inline-flex size-[30px] cursor-pointer items-center justify-center rounded-sm hover:bg-muted hover:text-foreground focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              {tool.face}
            </button>
          ))}
        </div>
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(mode)}>
        <Textarea
          ref={setTextarea}
          id={id}
          mono
          rows={rows}
          hidden={mode === 'preview'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          invalid={invalid}
          aria-describedby={describedBy}
          aria-required={required}
        />
        {mode === 'preview' ? (
          <div className="min-h-[132px] rounded-sm border border-border px-3.5 py-3">
            {value.trim() ? (
              <Markdown>{value}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
