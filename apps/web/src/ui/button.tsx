import type { ComponentProps } from 'react';

type ButtonVariant = 'primary' | 'outline' | 'ghost-muted' | 'destructive';
type ButtonSize = 'sm' | 'md';

// Kuat's ee-blue skin, from kuat-core's button-variables.css.
const variants: Readonly<Record<ButtonVariant, string>> = {
  primary:
    'border-transparent bg-(--kuat-button-ee-blue-primary-background) text-(--kuat-button-ee-blue-primary-foreground) enabled:hover:bg-(--kuat-button-ee-blue-primary-background--hover) enabled:active:bg-(--kuat-button-ee-blue-primary-background--active) disabled:bg-(--kuat-button-ee-blue-primary-background--disabled) disabled:text-(--kuat-button-ee-blue-primary-foreground--disabled)',
  outline:
    'border-(--kuat-button-ee-blue-outline-border) bg-transparent text-(--kuat-button-ee-blue-outline-foreground) enabled:hover:bg-(--kuat-button-ee-blue-outline-background--hover) enabled:active:bg-(--kuat-button-ee-blue-outline-background--active) disabled:border-(--slate-300) disabled:text-(--slate-500)',
  'ghost-muted':
    'border-transparent bg-transparent text-(--kuat-button-ee-blue-ghost-muted-foreground) enabled:hover:bg-(--kuat-button-ee-blue-ghost-muted-background--hover) enabled:active:bg-(--kuat-button-ee-blue-ghost-muted-background--active) disabled:text-(--kuat-button-ee-blue-ghost-muted-foreground--disabled)',
  destructive:
    'border-transparent bg-(--kuat-button-ee-blue-destructive-background) text-(--kuat-button-ee-blue-destructive-foreground) enabled:hover:bg-(--kuat-button-ee-blue-destructive-background--hover) enabled:active:bg-(--kuat-button-ee-blue-destructive-background--active) disabled:bg-(--slate-200) disabled:text-(--slate-500)',
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
export const Button = ({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  ...props
}: ButtonProps) => (
  <button
    type={type === 'submit' ? 'submit' : 'button'}
    className={`inline-flex cursor-pointer items-center justify-center rounded-md border text-sm leading-none font-medium whitespace-nowrap transition-[background-color,border-color,box-shadow] duration-120 select-none focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)] focus-visible:outline-none disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`}
    {...props}
  />
);
