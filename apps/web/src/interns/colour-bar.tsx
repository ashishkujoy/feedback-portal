import type { InternCounts } from '@feedback-portal/contracts';
import type { CSSProperties } from 'react';
import { colourTones } from './colour-chip.tsx';
import { colourKeys, filterLabels } from './roster.ts';

/** A segment's share: it grows with its count, so the 2px gaps don't push the bar wider. */
const segmentStyle = (count: number): CSSProperties => ({ flexGrow: count });

/**
 * A1's colour bar: an 8px row of segments sized by each code's share, with 2px gaps (empty codes
 * are left out, 7.8 decision 3), then a legend of every code with its count.
 */
export const ColourBar = ({ colours }: Readonly<{ colours: InternCounts['colours'] }>) => (
  <div className="flex flex-col gap-2">
    <div aria-hidden className="flex h-2 gap-0.5">
      {colourKeys
        .filter((key) => colours[key] > 0)
        .map((key) => (
          <span
            key={key}
            data-colour={key}
            className={`basis-0 ${colourTones[key].dot}`}
            style={segmentStyle(colours[key])}
          />
        ))}
    </div>
    <ul
      aria-label="Colour codes"
      className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground"
    >
      {colourKeys.map((key) => (
        <li key={key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={`size-2 rounded-full ${colourTones[key].dot}`} />
          {filterLabels[key]} {colours[key]}
        </li>
      ))}
    </ul>
  </div>
);
