import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export type MultiSelectOption<T extends string> = Readonly<{
  value: T;
  label: string;
  disabled?: boolean;
  /** Why it's disabled, shown under the label. */
  hint?: string | undefined;
}>;

type MultiSelectProps<T extends string> = Readonly<{
  /** What is being chosen, e.g. "Roles for Grace Hopper"; the trigger adds the current choice. */
  label: string;
  options: readonly MultiSelectOption<T>[];
  value: readonly T[];
  onToggle: (value: T) => void;
  /**
   * Blocks changes (e.g. while one is saving). An open list stays usable for focus, so a keyboard
   * user keeps their place; toggles are ignored until it's enabled again.
   */
  disabled?: boolean;
}>;

const ring = 'shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)]';

/**
 * Kuat Select (`sm`, 180px) where several options can be chosen. The list is a group of real
 * checkboxes styled as Kuat's options: choosing one toggles it at once and leaves the list open.
 * Tab and Space work as for any checkbox; Escape, a click outside or tabbing away closes it.
 */
export const MultiSelect = <T extends string>({
  label,
  options,
  value,
  onToggle,
  disabled = false,
}: MultiSelectProps<T>) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLFieldSetElement>(null);
  const listId = useId();
  const summary = options
    .filter((option) => value.includes(option.value))
    .map((option) => option.label)
    .join(', ');

  useEffect(() => {
    const root = rootRef.current;
    if (!open || !root) return undefined;
    listRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
    const outside = (target: EventTarget | null) =>
      !(target instanceof Node && root.contains(target));
    const onPointerDown = (event: MouseEvent) => {
      if (outside(event.target)) setOpen(false);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget !== null && outside(event.relatedTarget)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    root.addEventListener('focusout', onFocusOut);
    root.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      root.removeEventListener('focusout', onFocusOut);
      root.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block w-[180px]">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled && !open}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${summary}`}
        title={summary}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={`flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-sm border bg-input px-3 text-sm text-foreground transition-[border-color,box-shadow] duration-120 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${open ? `border-ring ${ring}` : 'border-border focus-visible:border-ring focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)]'}`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown
          aria-hidden
          size={16}
          strokeWidth={2}
          className={`shrink-0 text-muted-foreground transition-transform duration-120 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <fieldset
          ref={listRef}
          id={listId}
          aria-label={label}
          aria-busy={disabled}
          className="absolute top-[calc(100%+4px)] right-0 left-0 z-20 m-0 flex max-h-60 min-w-0 flex-col overflow-y-auto border border-border bg-background p-1 shadow-lg"
        >
          {options.map((option) => {
            const checked = value.includes(option.value);
            const labelId = `${listId}-${option.value}-label`;
            const hintId = `${listId}-${option.value}-hint`;
            return (
              <label
                key={option.value}
                className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm text-foreground has-focus-visible:shadow-[inset_0_0_0_1px_var(--ring)] has-disabled:cursor-not-allowed has-disabled:opacity-60 ${checked ? 'bg-accent' : 'hover:bg-muted'} cursor-pointer`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  disabled={option.disabled}
                  // Named by the label alone; the hint is its description.
                  aria-labelledby={labelId}
                  aria-describedby={option.hint ? hintId : undefined}
                  onChange={() => {
                    if (!disabled) onToggle(option.value);
                  }}
                />
                <span className="flex min-w-0 flex-col">
                  <span id={labelId}>{option.label}</span>
                  {option.hint ? (
                    <span id={hintId} className="text-xs text-muted-foreground">
                      {option.hint}
                    </span>
                  ) : null}
                </span>
                {checked ? (
                  <Check
                    aria-hidden
                    size={15}
                    strokeWidth={2.5}
                    className="shrink-0 text-primary"
                  />
                ) : null}
              </label>
            );
          })}
        </fieldset>
      ) : null}
    </div>
  );
};
