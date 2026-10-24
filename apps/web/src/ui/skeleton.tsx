type SkeletonProps = Readonly<{
  /** Tailwind classes for the size, e.g. `h-4 w-[70%]`. */
  className: string;
  round?: boolean;
}>;

/** Kuat Skeleton: a shimmering placeholder on slate 200/100, `--radius-sm` or round. */
export const Skeleton = ({ className, round = false }: SkeletonProps) => (
  <span
    aria-hidden
    className={`block animate-[kuat-shimmer_1.4s_ease_infinite] bg-[linear-gradient(90deg,var(--slate-200)_25%,var(--slate-100)_37%,var(--slate-200)_63%)] bg-size-[400%_100%] ${round ? 'rounded-full' : 'rounded-sm'} ${className}`}
  />
);
