import type { InternSummary } from '@feedback-portal/contracts';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { internsQuery } from '../api/interns.ts';
import { isApiError } from '../api/errors.ts';
import { today } from '../batches/batch-dates.ts';
import { Button } from '../ui/button.tsx';
import { Callout } from '../ui/callout.tsx';
import { SearchInput } from '../ui/search-input.tsx';
import { Skeleton } from '../ui/skeleton.tsx';
import { ToggleTag } from '../ui/tag.tsx';
import { ViewToggle } from '../ui/view-toggle.tsx';
import { summaryDots } from './colour-chip.tsx';
import { InternCard } from './intern-card.tsx';
import {
  filterLabels,
  type RosterFilter,
  rosterCounts,
  rosterRows,
  summaryKeys,
} from './roster.ts';
import { RosterTable } from './roster-table.tsx';

export type RosterView = 'cards' | 'table';

/** What the URL keeps (7.4 decision 3). */
export type RosterState = Readonly<{ view: RosterView; filter: RosterFilter; q: string }>;

type RosterPanelProps = RosterState &
  Readonly<{
    batch: Readonly<{ id: string; isArchived: boolean }>;
    onStateChange: (next: Partial<RosterState>) => void;
    /** For the batch's managers: the empty state's Add intern. */
    onAddIntern?: (() => void) | undefined;
    /** For the batch's managers: the empty state's Import from Airtable. */
    onImport?: (() => void) | undefined;
  }>;

const viewOptions = [
  { value: 'cards', label: 'Cards' },
  { value: 'table', label: 'Table' },
] as const;

/** A2's summary strip: a dot, the label and the count for each colour and status. */
const SummaryStrip = ({ count }: Readonly<{ count: (filter: RosterFilter) => number }>) => (
  <dl className="grid grid-cols-11 border border-border bg-background">
    {summaryKeys.map((key) => (
      <div key={key} className="flex flex-col gap-1 border-border p-3 not-last:border-r">
        <dt className="flex items-start gap-1.5 text-xs leading-4 text-muted-foreground">
          <span aria-hidden className={`mt-1 size-2 shrink-0 rounded-full ${summaryDots[key]}`} />
          {filterLabels[key]}
        </dt>
        <dd className="text-xl font-semibold tracking-[-0.3px]">{count(key)}</dd>
      </div>
    ))}
  </dl>
);

/** A centred message in a bordered box: the empty and no-results states. */
const EmptyBox = ({
  title,
  description,
  children,
  large = false,
}: Readonly<{ title: string; description: string; children?: ReactNode; large?: boolean }>) => (
  <div
    className={`flex flex-col items-center gap-2 border border-border bg-background px-6 text-center ${large ? 'py-16' : 'py-12'}`}
  >
    <p className={`font-semibold ${large ? 'text-base' : 'text-[15px]'}`}>{title}</p>
    <p className={`text-muted-foreground ${large ? 'text-sm' : 'text-[13px]'}`}>{description}</p>
    {children ? <div className="flex gap-2 pt-2">{children}</div> : null}
  </div>
);

/** A2-loading: eight skeleton cards. */
const Loading = () => (
  <div aria-busy className="grid grid-cols-4 gap-4">
    {Array.from({ length: 8 }, (_, index) => (
      <div key={index} className="flex flex-col gap-3 border border-border bg-background p-4">
        <Skeleton round className="size-12" />
        <Skeleton className="h-4 w-[70%]" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    ))}
  </div>
);

type ListProps = RosterState &
  Readonly<{
    interns: readonly InternSummary[];
    batch: RosterPanelProps['batch'];
    onStateChange: RosterPanelProps['onStateChange'];
  }>;

/** The summary, the toolbar and filters, then the cards or the table (or no results). */
const RosterList = ({ interns, batch, view, filter, q, onStateChange }: ListProps) => {
  const count = rosterCounts(interns);
  const rows = rosterRows(interns, {
    filter,
    search: q,
    batch,
    today: today(),
  });
  const search = q.trim();

  return (
    <>
      <SummaryStrip count={count} />
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <SearchInput
            label="Search interns by username"
            placeholder="Search by username"
            value={q}
            onChange={(next) => onStateChange({ q: next })}
            className="w-[280px]"
          />
          <ViewToggle
            label="View"
            options={viewOptions}
            value={view}
            onChange={(next) => onStateChange({ view: next })}
          />
        </div>
        <fieldset className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
          <legend className="sr-only">Filter interns</legend>
          {(['all', ...summaryKeys] as const).map((key) => (
            <ToggleTag
              key={key}
              selected={filter === key}
              // Choosing the selected tag again goes back to All.
              onClick={() => onStateChange({ filter: filter === key ? 'all' : key })}
            >
              {filterLabels[key]} {count(key)}
            </ToggleTag>
          ))}
        </fieldset>
      </div>
      {rows.length === 0 ? (
        <EmptyBox
          title={`No interns match “${search || filterLabels[filter]}”`}
          description="Try another username, or clear the search and filters."
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => onStateChange({ q: '', filter: 'all' })}
          >
            Clear filters
          </Button>
        </EmptyBox>
      ) : view === 'table' ? (
        <RosterTable rows={rows} total={interns.length} />
      ) : (
        <ul aria-label="Interns" className="grid grid-cols-4 gap-4">
          {rows.map((row) => (
            <InternCard key={row.intern.id} {...row} />
          ))}
        </ul>
      )}
    </>
  );
};

/**
 * A2 / A3 / M2 · the Interns tab: the roster with its states. The search and filters are kept
 * through a failed load and a retry.
 */
export const RosterPanel = ({
  batch,
  onStateChange,
  onAddIntern,
  onImport,
  ...state
}: RosterPanelProps) => {
  const { data: interns, error, refetch, isFetching } = useQuery(internsQuery(batch.id));

  if (error && !interns) {
    return (
      <div className="flex flex-col items-start gap-3">
        <div className="w-full">
          <Callout type="issue" title="We couldn't load the interns">
            {isApiError(error) && error.detail ? `${error.detail} ` : ''}Your filters are kept.
          </Callout>
        </div>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!interns) return <Loading />;
  if (interns.length === 0) {
    return (
      <EmptyBox
        large
        title="No interns yet"
        description={
          onAddIntern
            ? 'Import interns from Airtable, or add them one at a time.'
            : 'The programme manager adds interns to this batch.'
        }
      >
        {onAddIntern ? (
          <>
            {onImport ? <Button onClick={onImport}>Import from Airtable</Button> : null}
            <Button variant="outline" onClick={onAddIntern}>
              Add intern
            </Button>
          </>
        ) : null}
      </EmptyBox>
    );
  }
  return <RosterList interns={interns} batch={batch} onStateChange={onStateChange} {...state} />;
};
