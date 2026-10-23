import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';

type CheckboxProps = Omit<ComponentProps<'input'>, 'type'> & Readonly<{ label: string }>;

/**
 * Kuat Checkbox: an 18px box (1.5px `slate-300` border, `--primary` when checked) and a 14px
 * label. A real checkbox, visually hidden, keeps it keyboard- and form-accessible.
 */
export const Checkbox = ({ label, ...props }: CheckboxProps) => (
  <label className="inline-flex cursor-pointer items-center gap-2 has-disabled:cursor-not-allowed has-disabled:opacity-60">
    <input type="checkbox" className="peer sr-only" {...props} />
    <span
      aria-hidden
      className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-sm border-[1.5px] border-(--slate-300) bg-input text-primary-foreground transition-[background-color,border-color] duration-120 peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)] peer-checked:[&>svg]:visible"
    >
      <Check size={12} strokeWidth={3.5} className="invisible" />
    </span>
    <span className="text-sm text-foreground">{label}</span>
  </label>
);
