import type { BatchDetail, BatchOverview } from '@feedback-portal/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useMemo, useState } from 'react';
import { batchOverviewQuery } from '../../api/batch-overview.ts';
import { isApiError } from '../../api/errors.ts';
import { feedbackQuery } from '../../api/feedback.ts';
import { internQuery } from '../../api/interns.ts';
import { ColourChip, colourTones } from '../../interns/colour-chip.tsx';
import { InternLink } from '../../interns/intern-link.tsx';
import { RecordConversationDialog } from '../../interns/profile/record-conversation-dialog.tsx';
import { Avatar } from '../../ui/avatar.tsx';
import { Button } from '../../ui/button.tsx';
import { Callout } from '../../ui/callout.tsx';
import { Skeleton } from '../../ui/skeleton.tsx';
import { StatusBadge } from '../../ui/status-badge.tsx';
import { formatDate, formatDay, today } from '../batch-dates.ts';
import { distributionNote, distributionRows, noticeLeft, waitingLabel } from './overview.ts';

const widthStyle = (width: string): CSSProperties => ({ width });

const cardTitle = 'm-0 text-lg font-semibold tracking-[-0.2px]';

/** v2 A24's first card: the bar of segments, then the rows in two columns. */
const ColourDistribution = ({ overview }: Readonly<{ overview: BatchOverview }>) => {
  const rows = distributionRows(overview);
  return (
    <section
      aria-labelledby="overview-colours"
      className="flex flex-col gap-4 border border-border bg-background p-5"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="overview-colours" className={cardTitle}>
          Colour distribution
        </h2>
        <span className="text-[13px] text-muted-foreground">
          {overview.current === 0 ? 'No current interns yet.' : distributionNote(overview)}
        </span>
      </div>
      {overview.current === 0 ? null : (
        <>
          <div aria-hidden className="flex h-4 gap-0.5">
            {rows
              .filter((row) => row.count > 0)
              .map((row) => (
                <div
                  key={row.key}
                  className={colourTones[row.key].dot}
                  style={widthStyle(row.share)}
                />
              ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-10 gap-y-2.5">
            {rows.map((row) => (
              <li
                key={row.key}
                className="grid grid-cols-[150px_minmax(0,1fr)_36px_44px] items-center gap-3 text-sm"
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-2.5 rounded-full ${colourTones[row.key].dot}`}
                  />
                  {row.label}
                </span>
                <div aria-hidden className="h-2 bg-(--slate-100)">
                  <div
                    className={`h-2 ${colourTones[row.key].dot}`}
                    style={widthStyle(row.relative)}
                  />
                </div>
                <span className="text-right font-semibold">{row.count}</span>
                <span className="text-right text-muted-foreground">{row.percent}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};

const Card = ({
  id,
  title,
  aside,
  empty,
  children,
}: Readonly<{
  id: string;
  title: string;
  /** Muted text at the header's right ("4 submitted"). */
  aside: string | null;
  empty: string | null;
  children: ReactNode;
}>) => (
  <section aria-labelledby={id} className="border border-border bg-background">
    <div className="flex items-center justify-between border-b border-border px-5 py-4">
      <h2 id={id} className={cardTitle}>
        {title}
      </h2>
      {aside ? <span className="text-[13px] text-muted-foreground">{aside}</span> : null}
    </div>
    {empty ? (
      <p className="px-5 py-4 text-sm text-muted-foreground">{empty}</p>
    ) : (
      <ul>{children}</ul>
    )}
  </section>
);

/** The intern's name, linking to their profile; built from plain values so rows stay cheap. */
const NameLink = ({
  batchId,
  internId,
  name,
}: Readonly<{ batchId: string; internId: string; name: string }>) => {
  const intern = useMemo(() => ({ id: internId, batchId, name }), [internId, batchId, name]);
  return <InternLink intern={intern} className="text-sm font-medium" />;
};

const rowClass = 'flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0';

/** v2 A24's On notice card: the end, who issued it, and the days left or Decision needed. */
const NoticeCard = ({
  batchId,
  overview,
}: Readonly<{ batchId: string; overview: BatchOverview }>) => {
  const on = today();
  return (
    <Card
      id="overview-notice"
      title="On notice"
      aside={null}
      empty={overview.onNotice.length === 0 ? 'No one is on notice.' : null}
    >
      {overview.onNotice.map(({ intern, noticeEndsOn, issuedBy }) => {
        const left = noticeLeft(noticeEndsOn, on);
        return (
          <li key={intern.id} className={rowClass}>
            <Avatar name={intern.name} src={intern.photoUrl} size="sm" />
            <div className="flex min-w-0 flex-1 flex-col">
              <NameLink batchId={batchId} internId={intern.id} name={intern.name} />
              <span className="text-xs text-muted-foreground">
                Ends {formatDate(noticeEndsOn)}
                {issuedBy ? ` · issued by ${issuedBy.name}` : ''}
              </span>
            </div>
            {left.kind === 'ended' ? (
              <StatusBadge type="warning">Decision needed</StatusBadge>
            ) : (
              <span
                className={`text-[13px] font-medium ${left.urgent ? 'text-runtime-red-700' : 'text-foreground'}`}
              >
                {left.label}
              </span>
            )}
          </li>
        );
      })}
    </Card>
  );
};

type Delivering = Readonly<{ internId: string; feedbackId: string }>;

/** A8 for one row: loads the intern and their feedback, then opens with that feedback chosen. */
const RecordFromOverview = ({
  batch,
  delivering,
  onClose,
}: Readonly<{ batch: BatchDetail; delivering: Delivering; onClose: () => void }>) => {
  const queryClient = useQueryClient();
  const intern = useQuery(internQuery(batch.id, delivering.internId));
  const entries = useQuery(feedbackQuery(batch.id, delivering.internId));
  const target = useMemo(
    () => ({ kind: 'record' as const, feedbackId: delivering.feedbackId }),
    [delivering.feedbackId],
  );
  if (!intern.data || !entries.data) return null;
  return (
    <RecordConversationDialog
      intern={intern.data}
      batch={batch}
      entries={entries.data}
      target={target}
      onClose={onClose}
      onSaved={() =>
        queryClient.invalidateQueries({
          queryKey: batchOverviewQuery(batch.id).queryKey,
          exact: true,
        })
      }
    />
  );
};

/** v2 A24's Feedback to deliver card; its PM records the conversation from a row (decision 4). */
const DeliverCard = ({
  batch,
  overview,
  canRecord,
}: Readonly<{ batch: BatchDetail; overview: BatchOverview; canRecord: boolean }>) => {
  const [delivering, setDelivering] = useState<Delivering | null>(null);
  const waiting = overview.toDeliver.length;
  return (
    <Card
      id="overview-deliver"
      title="Feedback to deliver"
      aside={`${waiting} submitted`}
      empty={waiting === 0 ? 'No feedback is waiting to be delivered.' : null}
    >
      {overview.toDeliver.map((row) => (
        <li key={row.feedbackId} className={rowClass}>
          <Avatar name={row.intern.name} src={row.intern.photoUrl} size="sm" />
          <div className="flex min-w-0 flex-1 flex-col">
            <NameLink batchId={batch.id} internId={row.intern.id} name={row.intern.name} />
            <span className="text-xs text-muted-foreground">
              From {row.author.name} · {formatDay(row.submittedAt)} ·{' '}
              {waitingLabel(row.submittedAt)}
            </span>
          </div>
          <ColourChip code={row.colorCode} />
          {canRecord ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDelivering({ internId: row.intern.id, feedbackId: row.feedbackId })}
            >
              Record conversation
            </Button>
          ) : null}
        </li>
      ))}
      {delivering ? (
        <RecordFromOverview
          batch={batch}
          delivering={delivering}
          onClose={() => setDelivering(null)}
        />
      ) : null}
    </Card>
  );
};

/** Kuat Skeletons in the cards' shapes while the overview loads. */
const OverviewSkeleton = () => (
  <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading the overview">
    <div className="flex flex-col gap-4 border border-border bg-background p-5">
      <Skeleton className="h-5 w-[30%]" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[60%]" />
    </div>
    <div className="grid grid-cols-2 gap-5">
      {[0, 1].map((key) => (
        <div key={key} className="flex flex-col gap-3 border border-border bg-background p-5">
          <Skeleton className="h-5 w-[40%]" />
          <Skeleton className="h-4 w-[80%]" />
          <Skeleton className="h-4 w-[70%]" />
        </div>
      ))}
    </div>
  </div>
);

/**
 * v2 A24 · the batch's Overview tab (11.1): the colour distribution of current interns, who's on
 * notice, and the feedback waiting for a conversation. Record conversation is the PM's, while the
 * batch isn't archived.
 */
export const OverviewPanel = ({
  batch,
  canRecord,
}: Readonly<{ batch: BatchDetail; canRecord: boolean }>) => {
  const { data: overview, error } = useQuery(batchOverviewQuery(batch.id));
  if (error) {
    return (
      <Callout type="issue" title="We couldn't load the overview">
        {isApiError(error) ? error.detail : undefined}
      </Callout>
    );
  }
  if (!overview) return <OverviewSkeleton />;
  return (
    <>
      <ColourDistribution overview={overview} />
      <div className="grid grid-cols-2 items-start gap-5">
        <NoticeCard batchId={batch.id} overview={overview} />
        <DeliverCard batch={batch} overview={overview} canRecord={canRecord} />
      </div>
    </>
  );
};
