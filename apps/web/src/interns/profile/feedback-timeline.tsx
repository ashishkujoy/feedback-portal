import type { FeedbackView } from '@feedback-portal/contracts';
import { ArrowRight, MessageSquare, PenLine, Pencil, type LucideIcon } from 'lucide-react';
import { Button } from '../../ui/button.tsx';
import { Markdown } from '../../ui/markdown.tsx';
import { Skeleton } from '../../ui/skeleton.tsx';
import { StatusBadge } from '../../ui/status-badge.tsx';
import { ColourChip } from '../colour-chip.tsx';
import {
  colourChange,
  dayAndMonth,
  excerpt,
  feedbackLine,
  isEditableBy,
  stateBadge,
} from './feedback-entry.ts';

/** v2's rail: a 32px tinted circle with the entry's icon, and a line down to the next entry. */
const Rail = ({
  icon: Icon,
  tone,
  last,
}: Readonly<{ icon: LucideIcon; tone: string; last: boolean }>) => (
  <div aria-hidden className="flex w-8 shrink-0 flex-col items-center">
    <span
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full ${tone}`}
    >
      <Icon size={16} strokeWidth={2} />
    </span>
    {last ? null : <span className="min-h-3 w-0.5 flex-1 bg-border" />}
  </div>
);

const ColourRow = ({ entry }: Readonly<{ entry: FeedbackView }>) => {
  const change = colourChange(entry);
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
      {change.kind === 'changed' ? (
        <>
          <ColourChip code={change.from} />
          <ArrowRight aria-hidden size={14} strokeWidth={2} className="text-muted-foreground" />
          <span className="sr-only">to</span>
          <ColourChip code={change.to} />
        </>
      ) : null}
      {change.kind === 'first' ? <ColourChip code={change.to} /> : null}
      {change.kind === 'unchanged' ? (
        <>
          <ColourChip code={change.code} />
          <span className="text-xs text-muted-foreground">Colour code unchanged</span>
        </>
      ) : null}
      {entry.givesNotice ? <StatusBadge type="error">Notice</StatusBadge> : null}
    </div>
  );
};

type FeedbackCardProps = Readonly<{
  entry: FeedbackView;
  /** The author's Edit, while it's awaiting delivery (9.8). */
  onEdit: (() => void) | undefined;
}>;

/**
 * v2 P6's feedback card: who and when, the state, the colour change and notice, the text, and
 * for its author an Edit button at the bottom left (9.8).
 */
const FeedbackCard = ({ entry, onEdit }: FeedbackCardProps) => {
  const badge = stateBadge(entry);
  return (
    <article
      aria-label={`Feedback from ${entry.author.name}`}
      className="border border-border bg-background"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm">
          <span className="font-semibold">{entry.author.name}</span>
          <span className="text-muted-foreground"> {feedbackLine(entry)}</span>
        </p>
        <StatusBadge type={badge.type}>{badge.label}</StatusBadge>
      </div>
      <ColourRow entry={entry} />
      <div className="px-4 pt-3 pb-3.5">
        <Markdown>{entry.body}</Markdown>
      </div>
      {onEdit ? (
        <div className="flex px-4 pb-3">
          <Button variant="ghost-muted" size="sm" onClick={onEdit}>
            <Pencil aria-hidden size={14} strokeWidth={2} />
            Edit
          </Button>
        </div>
      ) : null}
    </article>
  );
};

type DraftCardProps = Readonly<{
  draft: FeedbackView;
  /** Absent when the draft can't be changed any more (9.6 decision 3). */
  onContinue: (() => void) | undefined;
  onDiscard: (() => void) | undefined;
}>;

/** v2 P6's draft: dashed, "only you can see this", Continue editing and Discard. */
const DraftCard = ({ draft, onContinue, onDiscard }: DraftCardProps) => {
  const text = excerpt(draft.body);
  return (
    <article
      aria-label="Your draft"
      className="flex flex-col gap-2.5 border border-dashed border-(--slate-400) bg-background px-4 py-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-semibold">Your draft</span>
          <span className="text-muted-foreground">
            {' '}
            · only you can see this · edited {dayAndMonth(draft.updatedAt)}
          </span>
        </p>
        <StatusBadge>Draft</StatusBadge>
      </div>
      <p className="text-sm leading-[21px] text-muted-foreground">{text || 'No text yet.'}</p>
      {onContinue || onDiscard ? (
        <div className="flex gap-2">
          {onContinue ? (
            <Button variant="outline" size="sm" onClick={onContinue}>
              Continue editing
            </Button>
          ) : null}
          {onDiscard ? (
            <Button variant="ghost-muted" size="sm" onClick={onDiscard}>
              Discard
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
};

type FeedbackTimelineProps = Readonly<{
  entries: readonly FeedbackView[];
  /** Who is looking: their own submitted feedback gets Edit. */
  viewerId: string | undefined;
  /** Absent when the viewer can't write feedback here any more (9.6 decision 3). */
  onContinue: ((draft: FeedbackView) => void) | undefined;
  onDiscard: ((draft: FeedbackView) => void) | undefined;
  onEdit: ((entry: FeedbackView) => void) | undefined;
}>;

/**
 * P6's timeline, feedback only for now (9.6 decision 1): the viewer's drafts, then submitted
 * feedback newest first, in the API's order.
 */
export const FeedbackTimeline = ({
  entries,
  viewerId,
  onContinue,
  onDiscard,
  onEdit,
}: FeedbackTimelineProps) => (
  <ol aria-label="Timeline" className="flex flex-col">
    {entries.map((entry, index) => {
      const draft = entry.state === 'draft';
      return (
        <li key={entry.id} className="flex gap-3.5">
          <Rail
            icon={draft ? PenLine : MessageSquare}
            tone={draft ? 'bg-(--slate-100) text-(--slate-600)' : 'bg-ee-blue-50 text-ee-blue-700'}
            last={index === entries.length - 1}
          />
          <div className="min-w-0 flex-1 pb-4">
            {draft ? (
              <DraftCard
                draft={entry}
                onContinue={onContinue ? () => onContinue(entry) : undefined}
                onDiscard={onDiscard ? () => onDiscard(entry) : undefined}
              />
            ) : (
              <FeedbackCard
                entry={entry}
                onEdit={
                  onEdit && viewerId && isEditableBy(entry, viewerId)
                    ? () => onEdit(entry)
                    : undefined
                }
              />
            )}
          </div>
        </li>
      );
    })}
  </ol>
);

/** Two cards' worth of Kuat Skeleton while the feedback loads. */
export const FeedbackTimelineSkeleton = () => (
  <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading feedback">
    {[0, 1].map((key) => (
      <div key={key} className="flex gap-3.5">
        <Skeleton round className="size-8 shrink-0" />
        <div className="flex flex-1 flex-col gap-3 border border-border bg-background p-4">
          <Skeleton className="h-4 w-[60%]" />
          <Skeleton className="h-4 w-[30%]" />
          <Skeleton className="h-4 w-[90%]" />
        </div>
      </div>
    ))}
  </div>
);
