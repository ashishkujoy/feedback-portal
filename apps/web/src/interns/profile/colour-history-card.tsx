import { colorCodes } from '@feedback-portal/contracts';
import type { CSSProperties } from 'react';
import { formatDate, formatDay } from '../../batches/batch-dates.ts';
import { colourTones } from '../colour-chip.tsx';
import { filterLabels } from '../roster.ts';
import { type ColourPoint, chartColumns, stripSegments } from './colour-history.ts';
import { dayAndMonth } from './feedback-entry.ts';
import { PanelCard } from './section-card.tsx';

const widthStyle = (share: number): CSSProperties => ({ width: `${share * 100}%` });

/** "6 Jul": a calendar date without its year, for the strip's ends. */
const shortDate = (isoDate: string): string => formatDate(isoDate).replace(/ \d+$/, '');

type ColourHistoryCardProps = Readonly<{
  history: readonly ColourPoint[];
  /** The strip's range (`YYYY-MM-DD`): the batch's start, and today or the final status day. */
  start: string;
  end: string;
  /** Whether `end` is today, labelled "Today". */
  endsToday: boolean;
}>;

/**
 * v2 A6's "Colour history" (9.7): a strip of how long each colour lasted, then a dot per coloured
 * feedback in its colour's row. Both are drawn for sighted readers; a hidden list says the same.
 */
export const ColourHistoryCard = ({ history, start, end, endsToday }: ColourHistoryCardProps) => {
  const segments = stripSegments(history, start, end);
  const { columns, hidden } = chartColumns(history);
  return (
    <PanelCard label="Colour history">
      <ul className="sr-only">
        {history.map((point) => (
          <li key={point.id}>{`${filterLabels[point.code]}, ${formatDay(point.at)}`}</li>
        ))}
      </ul>
      {segments.length > 0 ? (
        <div aria-hidden className="flex flex-col gap-1">
          <div data-testid="colour-strip" className="flex h-2.5 gap-px">
            {segments.map((segment) => (
              <div
                key={segment.from}
                data-code={segment.code ?? 'none'}
                className={colourTones[segment.code ?? 'none'].dot}
                style={widthStyle(segment.share)}
              />
            ))}
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{shortDate(start)}</span>
            <span>{endsToday ? 'Today' : shortDate(end)}</span>
          </div>
        </div>
      ) : null}
      <div aria-hidden data-testid="colour-chart" className="flex flex-col">
        {colorCodes.map((code) => (
          <div key={code} data-row={code} className="flex h-5 items-center">
            <span className="w-[104px] shrink-0 text-[11px] text-muted-foreground">
              {filterLabels[code]}
            </span>
            {columns.map((point) => (
              <div
                key={point.id}
                className="flex h-5 flex-1 items-center justify-center border-t border-(--slate-100)"
              >
                {point.code === code ? (
                  <span
                    data-testid="colour-dot"
                    className={`size-2.5 rounded-full ${colourTones[code].dot}`}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ))}
        <div className="flex h-[18px] items-end">
          <span className="w-[104px] shrink-0" />
          {columns.map((point) => (
            <span
              key={point.id}
              title={formatDay(point.at)}
              className="flex-1 text-center text-[11px] whitespace-nowrap text-muted-foreground"
            >
              {dayAndMonth(point.at)}
            </span>
          ))}
        </div>
      </div>
      {hidden > 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {`Latest ${columns.length} of ${history.length}.`}
        </p>
      ) : null}
    </PanelCard>
  );
};
