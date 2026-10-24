import type { ComponentProps, ReactNode } from 'react';

type TextInputProps = ComponentProps<'input'> &
  Readonly<{
    invalid?: boolean;
    leftIcon?: ReactNode;
    /** JetBrains Mono at 13/20, for data such as usernames; the left icon follows it. */
    mono?: boolean;
    /** Classes for the visible box (e.g. its width); the rest of the props go to the `<input>`. */
    className?: string;
  }>;

/**
 * Kuat Input (md): 36px high, padding 0 12px, `--radius-sm`. The border turns `--ring` with a 3px
 * ring on focus, and `--destructive` when invalid; disabled, it sits on `--muted` at 60%.
 */
export const TextInput = ({
  invalid = false,
  leftIcon,
  mono = false,
  className = '',
  ...props
}: TextInputProps) => (
  <div
    className={`flex h-9 items-center gap-2 rounded-sm border bg-input px-3 has-disabled:bg-muted has-disabled:opacity-60 ${mono ? 'font-mono text-[13px] leading-5' : 'text-sm'} transition-[border-color,box-shadow] duration-120 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)] ${invalid ? 'border-destructive' : 'border-border focus-within:border-ring'} ${className}`}
  >
    {leftIcon ? (
      <span aria-hidden className="inline-flex size-4 shrink-0 text-muted-foreground">
        {leftIcon}
      </span>
    ) : null}
    <input
      aria-invalid={invalid || undefined}
      className="h-full min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
      {...props}
    />
  </div>
);
