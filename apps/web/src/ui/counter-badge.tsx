/**
 * Kuat CounterBadge: a digits-only pill for counts, "99+" above `max`. Its text is the number
 * alone, so name what it counts where it's used.
 */
export const CounterBadge = ({ count, max = 99 }: Readonly<{ count: number; max?: number }>) => (
  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs leading-4 font-semibold text-white tabular-nums">
    {count > max ? `${max}+` : String(count)}
  </span>
);
