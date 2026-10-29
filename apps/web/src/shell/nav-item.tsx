import { Link, type LinkProps } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { CounterBadge } from '../ui/counter-badge.tsx';

type NavItemProps = Readonly<{
  to: NonNullable<LinkProps['to']>;
  icon: LucideIcon;
  label: string;
  /** A CounterBadge after the label; none when absent or 0. */
  count?: number | undefined;
}>;

/** A sidebar link; the router marks the active one (`data-status="active"`, `aria-current`). */
export const NavItem = ({ to, icon: Icon, label, count }: NavItemProps) => (
  <li>
    <Link
      to={to}
      // The badge's number alone wouldn't say what it counts.
      aria-label={count ? `${label} (${count})` : undefined}
      className="flex items-center gap-2.5 rounded-md px-2.5 py-[9px] text-sm font-medium text-tech-blue-100 transition-colors duration-150 hover:bg-white/8 data-[status=active]:bg-white/14 data-[status=active]:text-white"
    >
      <Icon aria-hidden size={18} strokeWidth={2} />
      <span className="flex-1">{label}</span>
      {count ? <CounterBadge count={count} /> : null}
    </Link>
  </li>
);
