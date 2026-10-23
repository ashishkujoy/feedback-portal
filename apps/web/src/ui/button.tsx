import type { ComponentProps } from 'react';

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'ghost-muted' | 'destructive';
type ButtonSize = 'sm' | 'md';

// Kuat's ee-blue skin, from kuat-core's button-variables.css.
const variants: Readonly<Record<ButtonVariant, string>> = {
  primary:
    'border-transparent bg-(--kuat-button-ee-blue-primary-background) text-(--kuat-button-ee-blue-primary-foreground) not-disabled:hover:bg-(--kuat-button-ee-blue-primary-background--hover) not-disabled:active:bg-(--kuat-button-ee-blue-primary-background--active) disabled:bg-(--kuat-button-ee-blue-primary-background--disabled) disabled:text-(--kuat-button-ee-blue-primary-foreground--disabled)',
  outline:
    'border-(--kuat-button-ee-blue-outline-border) bg-transparent text-(--kuat-button-ee-blue-outline-foreground) not-disabled:hover:bg-(--kuat-button-ee-blue-outline-background--hover) not-disabled:active:bg-(--kuat-button-ee-blue-outline-background--active) disabled:border-(--slate-300) disabled:text-(--slate-500)',
  ghost:
    'border-transparent bg-transparent text-(--kuat-button-ee-blue-ghost-foreground) not-disabled:hover:bg-(--kuat-button-ee-blue-ghost-background--hover) not-disabled:active:bg-(--kuat-button-ee-blue-ghost-background--active) disabled:text-(--slate-500)',
  'ghost-muted':
    'border-transparent bg-transparent text-(--kuat-button-ee-blue-ghost-muted-foreground) not-disabled:hover:bg-(--kuat-button-ee-blue-ghost-muted-background--hover) not-disabled:active:bg-(--kuat-button-ee-blue-ghost-muted-background--active) disabled:text-(--kuat-button-ee-blue-ghost-muted-foreground--disabled)',
  destructive:
    'border-transparent bg-(--kuat-button-ee-blue-destructive-background) text-(--kuat-button-ee-blue-destructive-foreground) not-disabled:hover:bg-(--kuat-button-ee-blue-destructive-background--hover) not-disabled:active:bg-(--kuat-button-ee-blue-destructive-background--active) disabled:bg-(--slate-200) disabled:text-(--slate-500)',
};

const sizes: Readonly<Record<ButtonSize, string>> = {
  sm: 'h-8 gap-1.5 px-3',
  md: 'h-9 gap-2 px-4',
};

type ButtonProps = Omit<ComponentProps<'button'>, 'type'> &
  Readonly<{ variant?: ButtonVariant; size?: ButtonSize; type?: 'button' | 'submit' }>;

/**
 * Kuat Button: `md` is 36px high with padding 0 16px, `sm` 32px with 0 12px; both 14px/500 and
 * `--radius-md`. Icons go in `children`.
 */
/** The classes, for things that look like a button but aren't one (e.g. a router `Link`). */
export const buttonClasses = ({
  variant = 'primary',
  size = 'md',
}: Readonly<{ variant?: ButtonVariant; size?: ButtonSize }> = {}): string =>
  `inline-flex cursor-pointer items-center justify-center rounded-md border text-sm leading-none font-medium whitespace-nowrap transition-[background-color,border-color,box-shadow] duration-120 select-none focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)] focus-visible:outline-none disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]}`;

export const Button = ({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  ...props
}: ButtonProps) => (
  <button
    type={type === 'submit' ? 'submit' : 'button'}
    className={`${buttonClasses({ variant, size })} ${className}`}
    {...props}
  />
);
