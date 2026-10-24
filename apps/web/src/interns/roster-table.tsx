import { Avatar } from '../ui/avatar.tsx';
import { StatusBadge } from '../ui/status-badge.tsx';
import { ColourChip } from './colour-chip.tsx';
import { ReadOnlyMark } from './intern-card.tsx';
import { InternLink } from './intern-link.tsx';
import type { RosterRow } from './roster.ts';

// A3: header 10px 16px, 12/500 muted on slate-50; rows 10px 16px, 14px; 16px gaps.
const firstCell = 'py-2.5 pr-2 pl-4';
const middleCell = 'px-2 py-2.5';
const lastCell = 'py-2.5 pr-4 pl-2';

type RosterTableProps = Readonly<{ rows: readonly RosterRow[]; total: number }>;

/**
 * A3's roster table without the feedback columns (7.4 decision 2): Intern, Colour code, Status
 * (a badge, or a muted "Active") and Read-only, then "Showing N of M interns".
 */
export const RosterTable = ({ rows, total }: RosterTableProps) => (
  <div className="border border-border bg-background">
    <table className="w-full table-fixed">
      <caption className="sr-only">Interns</caption>
      <colgroup>
        <col className="w-[44%]" />
        <col className="w-[24%]" />
        <col className="w-[32%]" />
        <col className="w-[146px]" />
      </colgroup>
      <thead>
        <tr className="border-b border-border bg-(--slate-50) text-left text-xs text-muted-foreground [&>th]:py-2.5 [&>th]:font-medium">
          <th scope="col" className={firstCell}>
            Intern
          </th>
          <th scope="col" className={middleCell}>
            Colour code
          </th>
          <th scope="col" className={middleCell}>
            Status
          </th>
          <th scope="col" className={lastCell}>
            <span className="sr-only">Access</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ intern, badge, readOnly }) => (
          <tr
            key={intern.id}
            className={`border-b border-border text-sm ${readOnly ? 'bg-(--slate-50)' : ''}`}
          >
            <th scope="row" className={`${firstCell} text-left font-normal`}>
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={intern.name} src={intern.photoUrl} size="sm" />
                <div className="flex min-w-0 flex-col">
                  <InternLink intern={intern} className="truncate font-medium" />
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    @{intern.username}
                  </span>
                </div>
              </div>
            </th>
            <td className={middleCell}>
              <ColourChip code={intern.colorCode} />
            </td>
            <td className={middleCell}>
              {badge ? (
                <StatusBadge type={badge.type}>{badge.label}</StatusBadge>
              ) : (
                <span className="text-[13px] text-muted-foreground">Active</span>
              )}
            </td>
            <td className={`${lastCell} text-right`}>{readOnly ? <ReadOnlyMark /> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="px-4 py-2.5 text-[13px] text-muted-foreground">
      Showing {rows.length} of {total} interns
    </p>
  </div>
);
