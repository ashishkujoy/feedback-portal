type ViewToggleProps<T extends string> = Readonly<{
  label: string;
  options: readonly Readonly<{ value: T; label: string }>[];
  value: T;
  onChange: (value: T) => void;
}>;

/**
 * A2's Cards | Table switch: joined segments in a bordered `--radius-md` box, 13px/500 with
 * padding 7px 12px; the chosen one on EE Blue 50 / 700.
 */
export const ViewToggle = <T extends string>({
  label,
  options,
  value,
  onChange,
}: ViewToggleProps<T>) => (
  <fieldset className="m-0 flex min-w-0 overflow-hidden rounded-md border border-border bg-background p-0">
    <legend className="sr-only">{label}</legend>
    {options.map((option, index) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(option.value)}
          className={`flex cursor-pointer items-center gap-1.5 px-3 py-[7px] text-[13px] font-medium focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] focus-visible:outline-none ${index > 0 ? 'border-l border-border' : ''} ${active ? 'bg-ee-blue-50 text-ee-blue-700' : 'text-muted-foreground'}`}
        >
          {option.label}
        </button>
      );
    })}
  </fieldset>
);
