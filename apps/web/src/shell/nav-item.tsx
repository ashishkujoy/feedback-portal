import { Link, type LinkProps } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';

type NavItemProps = Readonly<{ to: NonNullable<LinkProps['to']>; icon: LucideIcon; label: string }>;

/** A sidebar link; the router marks the active one (`data-status="active"`, `aria-current`). */
export const NavItem = ({ to, icon: Icon, label }: NavItemProps) => (
  <li>
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-md px-2.5 py-[9px] text-sm font-medium text-tech-blue-100 transition-colors duration-150 hover:bg-white/8 data-[status=active]:bg-white/14 data-[status=active]:text-white"
    >
      <Icon aria-hidden size={18} strokeWidth={2} />
      {label}
    </Link>
  </li>
);
