import type { ColorCode } from '@feedback-portal/contracts';
import { type ColourKey, filterLabels, type summaryKeys } from './roster.ts';

type Tone = Readonly<{ dot: string; chip: string }>;

/** REF-1's tokens: a dot, and the chip's background and text. */
export const colourTones: Readonly<Record<ColourKey, Tone>> = {
  green: { dot: 'bg-uptime-green-500', chip: 'bg-uptime-green-50 text-uptime-green-700' },
  yellow: { dot: 'bg-signal-yellow-300', chip: 'bg-signal-yellow-50 text-signal-yellow-700' },
  borderline_yellow: {
    dot: 'bg-signal-yellow-500',
    chip: 'bg-signal-yellow-100 text-signal-yellow-800',
  },
  orange: { dot: 'bg-equal-ember-500', chip: 'bg-equal-ember-50 text-equal-ember-700' },
  borderline_red: { dot: 'bg-cursor-coral-400', chip: 'bg-cursor-coral-50 text-cursor-coral-700' },
  red: { dot: 'bg-runtime-red-600', chip: 'bg-runtime-red-50 text-runtime-red-700' },
  none: { dot: 'bg-(--slate-300)', chip: 'bg-(--slate-100) text-(--slate-600)' },
};

/** The summary strip's dots: the colours', then v2's for the statuses. */
export const summaryDots: Readonly<Record<(typeof summaryKeys)[number], string>> = {
  green: colourTones.green.dot,
  yellow: colourTones.yellow.dot,
  borderline_yellow: colourTones.borderline_yellow.dot,
  orange: colourTones.orange.dot,
  borderline_red: colourTones.borderline_red.dot,
  red: colourTones.red.dot,
  none: colourTones.none.dot,
  on_notice: 'bg-runtime-red-600',
  terminated: 'bg-(--slate-500)',
  withdrawn: 'bg-(--slate-400)',
  graduated: 'bg-uptime-green-700',
};

/** A2's colour code pill: an 8px dot and the label, 12px/500. `null` is "No colour". */
export const ColourChip = ({ code }: Readonly<{ code: ColorCode | null }>) => {
  const key = code ?? 'none';
  const tone = colourTones[key];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs leading-[18px] font-medium whitespace-nowrap ${tone.chip}`}
    >
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${tone.dot}`} />
      {filterLabels[key]}
    </span>
  );
};
