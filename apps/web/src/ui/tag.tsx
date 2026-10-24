import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

const base =
  'inline-flex items-center gap-1 rounded-full px-2.5 py-2 text-sm leading-[21px] font-medium text-tag-base-foreground';

/** Kuat Tag, display mode, base colour: a pill label. */
export const Tag = ({ children }: Readonly<{ children: ReactNode }>) => (
  <span className={`${base} bg-tag-base-background`}>{children}</span>
);

type ToggleTagProps = Readonly<{
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}>;

/**
 * Kuat Tag, toggle mode: a pressed-state button. Selected, it takes the selected background and
 * a 14px check; idle, hovering shows the hover background and the border.
 */
export const ToggleTag = ({ selected, onClick, children }: ToggleTagProps) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={`${base} cursor-pointer border border-transparent transition-colors focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)] focus-visible:outline-none ${
      selected
        ? 'bg-(--tag-base-background-selected)'
        : 'bg-tag-base-background hover:border-(--tag-base-border) hover:bg-(--tag-base-background-hover)'
    }`}
  >
    {children}
    {selected ? <Check aria-hidden size={14} strokeWidth={2.5} className="shrink-0" /> : null}
  </button>
);
