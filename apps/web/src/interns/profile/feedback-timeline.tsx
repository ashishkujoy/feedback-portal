import type { CommentView, ConversationView, FeedbackView } from '@feedback-portal/contracts';
import {
  ArrowRight,
  CircleCheckBig,
  MessageCircle,
  MessageSquare,
  PenLine,
  Pencil,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../../ui/button.tsx';
import { Markdown } from '../../ui/markdown.tsx';
import { Skeleton } from '../../ui/skeleton.tsx';
import { StatusBadge } from '../../ui/status-badge.tsx';
import { ColourChip } from '../colour-chip.tsx';
import { formatDate } from '../../batches/batch-dates.ts';
import { type CommentTarget, CommentEntry } from './comment-entry.tsx';
import { CommentRow, type InternRef } from './comment-row.tsx';
import {
  colourChange,
  commentCounts,
  conversationLabel,
  dayAndMonth,
  deliveredLabel,
  excerpt,
  feedbackLabel,
  feedbackLine,
  isEditableBy,
  stateBadge,
  timelineEntries,
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
  /** The batch's PM's Record conversation, while it's awaiting delivery (10.3 decision 1). */
  onRecord: (() => void) | undefined;
  /** The comment row (10.5). */
  comments: CommentsProps;
}>;

/** What a card's comment row needs. */
type CommentsProps = Readonly<{ intern: InternRef; count: number; canComment: boolean }>;

/** The id a conversation's "Delivers …" link, or a comment's, points at. */
export const feedbackAnchor = (id: string) => `feedback-${id}`;

/** The id a comment's link points at. */
export const conversationAnchor = (id: string) => `conversation-${id}`;

/**
 * v2 P6's feedback card: who and when, the state, the colour change and notice, the text, and
 * its foot: the author's Edit (9.8), the PM's Record conversation (10.3), then the comment row
 * (10.5), in one row.
 */
const FeedbackCard = ({ entry, onEdit, onRecord, comments }: FeedbackCardProps) => {
  const badge = stateBadge(entry);
  return (
    <article
      id={feedbackAnchor(entry.id)}
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
      <CommentRow {...comments} parentKind="feedback" parentId={entry.id} className="px-2.5 pb-2.5">
        {onEdit ? (
          <Button variant="ghost-muted" size="sm" onClick={onEdit}>
            <Pencil aria-hidden size={14} strokeWidth={2} />
            Edit
          </Button>
        ) : null}
        {onRecord ? (
          <Button variant="outline" size="sm" onClick={onRecord}>
            Record conversation
          </Button>
        ) : null}
      </CommentRow>
    </article>
  );
};

type ConversationCardProps = Readonly<{
  conversation: ConversationView;
  /** The batch's PM's Edit (10.3 decision 3). */
  onEdit: (() => void) | undefined;
  /** The comment row (10.5 decision 5; not in v2). */
  comments: CommentsProps;
}>;

/**
 * v2 P6's conversation entry: a slate-50 card, "<PM> recorded a conversation · 10 Oct 2026", the
 * feedback it delivered (linked to its card) and the notes.
 */
const ConversationCard = ({ conversation, onEdit, comments }: ConversationCardProps) => (
  <article
    id={conversationAnchor(conversation.id)}
    aria-label={`Conversation recorded by ${conversation.recordedBy.name}`}
    className="flex flex-col gap-2 border border-border bg-(--slate-50) px-4 py-3"
  >
    <p className="text-sm">
      <span className="font-semibold">{conversation.recordedBy.name}</span>
      <span className="text-muted-foreground">
        {` recorded a conversation · ${formatDate(conversation.heldOn)}${conversation.editedAt ? ' · edited' : ''}`}
      </span>
    </p>
    <p className="text-xs text-muted-foreground">
      Delivers{' '}
      <a
        href={`#${feedbackAnchor(conversation.feedback.id)}`}
        className="text-primary underline-offset-2 hover:underline"
      >
        {deliveredLabel(conversation)}
      </a>
    </p>
    <Markdown>{conversation.notes}</Markdown>
    <CommentRow
      {...comments}
      parentKind="conversation"
      parentId={conversation.id}
      className="-mx-1.5"
    >
      {onEdit ? (
        <Button variant="ghost-muted" size="sm" onClick={onEdit}>
          <Pencil aria-hidden size={14} strokeWidth={2} />
          Edit
        </Button>
      ) : null}
    </CommentRow>
  </article>
);

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
  feedback: readonly FeedbackView[];
  conversations: readonly ConversationView[];
  /** Who is looking: their own submitted feedback gets Edit. */
  viewerId: string | undefined;
  /** Absent when the viewer can't write feedback here any more (9.6 decision 3). */
  onContinue: ((draft: FeedbackView) => void) | undefined;
  onDiscard: ((draft: FeedbackView) => void) | undefined;
  onEdit: ((entry: FeedbackView) => void) | undefined;
  /** Only for the batch's PM, while the record isn't read-only (10.2). */
  onRecord: ((entry: FeedbackView) => void) | undefined;
  onEditConversation: ((conversation: ConversationView) => void) | undefined;
  /** Every comment on the intern's feedback and conversations (10.5). */
  comments: readonly CommentView[];
  intern: InternRef;
  /** The batch's current mentors and PM, on a record that can change (10.5 decision 3). */
  canComment: boolean;
  onDeleteComment: (comment: CommentView) => void;
}>;

/** Where a comment's link goes, if what it's on is loaded. */
const targetOf = (
  comment: CommentView,
  feedback: readonly FeedbackView[],
  conversations: readonly ConversationView[],
): CommentTarget | null => {
  const { kind, id } = comment.parent;
  if (kind === 'conversation') {
    const conversation = conversations.find((each) => each.id === id);
    return conversation
      ? { label: conversationLabel(conversation), href: `#${conversationAnchor(id)}` }
      : null;
  }
  const entry = feedback.find((each) => each.id === id);
  return entry ? { label: feedbackLabel(entry), href: `#${feedbackAnchor(id)}` } : null;
};

/**
 * P6's timeline: the viewer's drafts, then feedback, conversations (10.3 decision 2) and comments
 * (10.5 decision 1) newest first. Status changes join in 10.6.
 */
export const FeedbackTimeline = ({
  feedback,
  conversations,
  viewerId,
  onContinue,
  onDiscard,
  onEdit,
  onRecord,
  onEditConversation,
  comments,
  intern,
  canComment,
  onDeleteComment,
}: FeedbackTimelineProps) => {
  const items = timelineEntries(feedback, conversations, comments);
  const counts = commentCounts(comments);
  const commentsOn = (id: string): CommentsProps => ({
    intern,
    count: counts.get(id) ?? 0,
    canComment,
  });
  return (
    <ol aria-label="Timeline" className="flex flex-col">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        if (item.kind === 'comment') {
          const { comment } = item;
          return (
            <li key={item.id} className="flex gap-3.5">
              <Rail icon={MessageCircle} tone="bg-(--slate-100) text-(--slate-600)" last={last} />
              <div className="min-w-0 flex-1 pb-4">
                <CommentEntry
                  intern={intern}
                  comment={comment}
                  on={targetOf(comment, feedback, conversations)}
                  onDelete={
                    canComment && comment.author.id === viewerId
                      ? () => onDeleteComment(comment)
                      : undefined
                  }
                />
              </div>
            </li>
          );
        }
        if (item.kind === 'conversation') {
          return (
            <li key={item.id} className="flex gap-3.5">
              <Rail
                icon={CircleCheckBig}
                tone="bg-(--transform-teal-50) text-(--transform-teal-700)"
                last={last}
              />
              <div className="min-w-0 flex-1 pb-4">
                <ConversationCard
                  conversation={item.conversation}
                  onEdit={
                    onEditConversation ? () => onEditConversation(item.conversation) : undefined
                  }
                  comments={commentsOn(item.id)}
                />
              </div>
            </li>
          );
        }
        const { entry } = item;
        const draft = entry.state === 'draft';
        return (
          <li key={item.id} className="flex gap-3.5">
            <Rail
              icon={draft ? PenLine : MessageSquare}
              tone={
                draft ? 'bg-(--slate-100) text-(--slate-600)' : 'bg-ee-blue-50 text-ee-blue-700'
              }
              last={last}
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
                  onRecord={
                    onRecord && entry.state === 'submitted' ? () => onRecord(entry) : undefined
                  }
                  comments={commentsOn(entry.id)}
                />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

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
