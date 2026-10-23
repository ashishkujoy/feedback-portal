import type { ComponentProps } from 'react';

type ButtonVariant = 'primary' | 'outline';

// Kuat's ee-blue skin, from kuat-core's button-variables.css.
const variants: Readonly<Record<ButtonVariant, string>> = {
  primary:
    'border-transparent bg-(--kuat-button-ee-blue-primary-background) text-(--kuat-button-ee-blue-primary-foreground) enabled:hover:bg-(--kuat-button-ee-blue-primary-background--hover) enabled:active:bg-(--kuat-button-ee-blue-primary-background--active) disabled:bg-(--kuat-button-ee-blue-primary-background--disabled) disabled:text-(--kuat-button-ee-blue-primary-foreground--disabled)',
  outline:
    'border-(--kuat-button-ee-blue-outline-border) bg-transparent text-(--kuat-button-ee-blue-outline-foreground) enabled:hover:bg-(--kuat-button-ee-blue-outline-background--hover) enabled:active:bg-(--kuat-button-ee-blue-outline-background--active) disabled:border-(--slate-300) disabled:text-(--slate-500)',
};

type ButtonProps = Omit<ComponentProps<'button'>, 'type'> &
  Readonly<{ variant?: ButtonVariant; type?: 'button' | 'submit' }>;

/** Kuat Button (md): 36px high, padding 0 16px, 14px/500, `--radius-md`. Icons go in `children`. */
export const Button = ({
  variant = 'primary',
  type = 'button',
  className = '',
  ...props
}: ButtonProps) => (
  <button
    type={type === 'submit' ? 'submit' : 'button'}
    className={`inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 text-sm leading-none font-medium whitespace-nowrap transition-[background-color,border-color,box-shadow] duration-120 select-none focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)] focus-visible:outline-none disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    {...props}
  />
);
