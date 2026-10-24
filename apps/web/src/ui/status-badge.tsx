import { CircleAlert, CircleCheckBig, CircleX, Info, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type StatusBadgeType = 'neutral' | 'info' | 'success' | 'warning' | 'error';

const tones: Readonly<Record<StatusBadgeType, { box: string; icon: LucideIcon | null }>> = {
  neutral: { box: 'bg-server-slate-200 text-neutral-950', icon: null },
  info: { box: 'bg-ee-blue-500 text-white', icon: Info },
  success: { box: 'bg-uptime-green-500 text-white', icon: CircleCheckBig },
  warning: { box: 'bg-equal-ember-500 text-white', icon: CircleAlert },
  error: { box: 'bg-runtime-red-600 text-white', icon: CircleX },
};

type StatusBadgeProps = Readonly<{ type?: StatusBadgeType; children: ReactNode }>;

/**
 * Kuat StatusBadge (base): a flat, solid label, 12px/600, with a 12px icon except for `neutral`.
 */
export const StatusBadge = ({ type = 'neutral', children }: StatusBadgeProps) => {
  const { box, icon: Icon } = tones[type];
  return (
    <span
      data-type={type}
      className={`inline-flex items-center gap-1.5 px-2 py-[3px] text-xs leading-4 font-semibold tracking-[0.18px] whitespace-nowrap ${box}`}
    >
      {Icon ? <Icon aria-hidden size={12} strokeWidth={2.25} className="shrink-0" /> : null}
      {children}
    </span>
  );
};
