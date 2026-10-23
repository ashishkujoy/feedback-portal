import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';

type SelectProps = ComponentProps<'select'> & Readonly<{ invalid?: boolean }>;

/**
 * The Kuat Select's trigger (md: 36px, padding 0 12px, `--input`, `--radius-sm`, a 16px muted
 * chevron) on a native `<select>`, so the list is the browser's own: keyboard, screen reader and
 * mobile friendly. Kuat's custom popover is used only where a native control can't do the job.
 */
export const Select = ({ invalid = false, className = '', children, ...props }: SelectProps) => (
  <span className={`relative flex ${className}`}>
    <select
      aria-invalid={invalid || undefined}
      className={`h-9 w-full cursor-pointer appearance-none rounded-sm border bg-input pr-9 pl-3 text-sm text-foreground transition-[border-color,box-shadow] duration-120 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)] focus:outline-none ${invalid ? 'border-destructive' : 'border-border focus:border-ring'}`}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden
      size={16}
      strokeWidth={2}
      className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
    />
  </span>
);
