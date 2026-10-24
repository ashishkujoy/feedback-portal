import type { ComponentProps } from 'react';

type SwitchProps = Omit<ComponentProps<'button'>, 'type' | 'role' | 'onChange'> &
  Readonly<{ checked: boolean; onChange: (checked: boolean) => void }>;

/**
 * Kuat Switch: a 36×20 track (`--primary` when on, `slate-300` off) with a 16px white thumb. A
 * `button` with `role="switch"`, so Space and Enter toggle it; label it with `aria-labelledby`.
 */
export const Switch = ({ checked, onChange, disabled, className = '', ...props }: SwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-block h-5 w-9 shrink-0 cursor-pointer rounded-full transition-[background-color] duration-160 focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${checked ? 'bg-primary' : 'bg-(--slate-300)'} ${className}`}
    {...props}
  >
    <span
      aria-hidden
      className={`absolute top-0.5 size-4 rounded-full bg-(--brand-byte-white) shadow-(--shadow-sm) transition-[left] duration-160 ${checked ? 'left-[18px]' : 'left-0.5'}`}
    />
  </button>
);
