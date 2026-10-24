import type { ComponentProps } from 'react';

type TextareaProps = ComponentProps<'textarea'> &
  Readonly<{
    invalid?: boolean;
    /** JetBrains Mono at 13/20, as the design uses for Markdown. */
    mono?: boolean;
  }>;

/**
 * Kuat Textarea: padding 10px 12px, `--radius-sm`, 14/21, resizable vertically. Like the Input,
 * the border turns `--ring` with a 3px ring on focus, and `--destructive` when invalid.
 */
export const Textarea = ({
  invalid = false,
  mono = false,
  rows = 4,
  className = '',
  ...props
}: TextareaProps) => (
  <textarea
    rows={rows}
    aria-invalid={invalid || undefined}
    className={`w-full resize-y rounded-sm border bg-input px-3 py-2.5 text-foreground transition-[border-color,box-shadow] duration-120 outline-none placeholder:text-muted-foreground focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)] ${mono ? 'font-mono text-[13px] leading-5' : 'text-sm leading-[21px]'} ${invalid ? 'border-destructive' : 'border-border focus:border-ring'} ${className}`}
    {...props}
  />
);
