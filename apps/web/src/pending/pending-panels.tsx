import type { MyPending } from '@feedback-portal/contracts';
import type { ReactNode } from 'react';
import { formatDay } from '../batches/batch-dates.ts';
import { monthLabel } from '../interns/feedback-form.ts';
import { ColourChip } from '../interns/colour-chip.tsx';
import { InternNameLink } from '../interns/intern-link.tsx';
import { excerpt } from '../interns/profile/feedback-entry.ts';
import { Avatar } from '../ui/avatar.tsx';
import { Button } from '../ui/button.tsx';
import { draftLine, internCount, lastFeedbackLabel, waitingFor } from './pending.ts';
import type { Opening } from './pending-dialog.tsx';

type Open = (opening: Opening) => void;

const headClass =
  'border-b border-border bg-(--slate-50) text-left text-xs text-muted-foreground [&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium';
const rowClass = 'border-b border-border text-sm [&>td]:px-4 [&>td]:py-2.5';

const Intern = ({
  batchId,
  intern,
}: Readonly<{ batchId: string; intern: MyPending['drafts'][number]['intern'] }>) => (
  <span className="flex items-center gap-2.5">
    <Avatar name={intern.name} src={intern.photoUrl} size="sm" />
    <InternNameLink batchId={batchId} internId={intern.id} name={intern.name} />
  </span>
);

/** A plain card for a list with nothing in it (decision 4). */
const Empty = ({ children }: Readonly<{ children: ReactNode }>) => (
  <p className="border border-border bg-background px-5 py-4 text-sm text-muted-foreground">
    {children}
  </p>
);

/** v2 M26: interns without your feedback this month, each with Give feedback (A7 here). */
export const NeedsFeedbackPanel = ({
  pending,
  meId,
  onOpen,
}: Readonly<{ pending: MyPending; meId: string; onOpen: Open }>) => {
  const rows = pending.needsFeedback;
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 border border-border bg-background px-6 py-14 text-center">
        <span className="text-base font-semibold">You're up to date</span>
        <span className="text-sm text-muted-foreground">
          Every intern in your batches has feedback from you for {monthLabel(pending.month)}.
        </span>
      </div>
    );
  }
  return (
    <div className="border border-border bg-background">
      <table className="w-full table-fixed">
        <caption className="sr-only">Interns needing your feedback</caption>
        <colgroup>
          <col />
          <col className="w-[19%]" />
          <col className="w-[17%]" />
          <col className="w-[25%]" />
          {/* The button (v2: 130px of grid) plus the cell's padding. */}
          <col className="w-[160px]" />
        </colgroup>
        <thead>
          <tr className={headClass}>
            <th scope="col">Intern</th>
            <th scope="col">Batch</th>
            <th scope="col">Colour code</th>
            <th scope="col">Last feedback</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.intern.id} className={rowClass}>
              <td>
                <Intern batchId={row.batch.id} intern={row.intern} />
              </td>
              <td className="truncate text-muted-foreground">{row.batch.name}</td>
              <td>
                <ColourChip code={row.colorCode} />
              </td>
              <td className="text-muted-foreground">{lastFeedbackLabel(row.lastFeedback, meId)}</td>
              <td className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Give feedback to ${row.intern.name}`}
                  onClick={() =>
                    onOpen({
                      action: 'give',
                      batchId: row.batch.id,
                      internId: row.intern.id,
                      feedbackId: null,
                    })
                  }
                >
                  Give feedback
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2.5 text-[13px] text-muted-foreground">{internCount(rows.length)}</p>
    </div>
  );
};

/** v2 M26-drafts: your drafts as dashed cards, with Continue (A7) and Discard (A26). */
export const DraftsPanel = ({
  pending,
  onOpen,
}: Readonly<{ pending: MyPending; onOpen: Open }>) => {
  if (pending.drafts.length === 0) return <Empty>No drafts.</Empty>;
  return (
    <ul className="flex flex-col gap-3">
      {pending.drafts.map((draft) => {
        const opening = (action: Opening['action']) => () =>
          onOpen({
            action,
            batchId: draft.batch.id,
            internId: draft.intern.id,
            feedbackId: draft.feedbackId,
          });
        const text = excerpt(draft.body);
        return (
          <li
            key={draft.feedbackId}
            className="flex items-center gap-4 border border-dashed border-(--slate-400) bg-background px-[18px] py-4"
          >
            <Avatar name={draft.intern.name} src={draft.intern.photoUrl} size="md" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2.5 text-sm">
                <span className="font-semibold">
                  <InternNameLink
                    batchId={draft.batch.id}
                    internId={draft.intern.id}
                    name={draft.intern.name}
                  />
                </span>
                <span className="text-muted-foreground">{draftLine(draft)}</span>
                <ColourChip code={draft.colorCode} />
              </div>
              <span className="truncate text-[13px] text-muted-foreground">
                {text || 'No text yet.'}
              </span>
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                aria-label={`Continue the draft for ${draft.intern.name}`}
                onClick={opening('continue')}
              >
                Continue
              </Button>
              <Button
                variant="ghost-muted"
                size="sm"
                aria-label={`Discard the draft for ${draft.intern.name}`}
                onClick={opening('discard')}
              >
                Discard
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

/** v2 P26: feedback waiting for you to deliver, each with Record conversation (A8 here). */
export const ToDeliverPanel = ({
  pending,
  onOpen,
}: Readonly<{ pending: MyPending; onOpen: Open }>) => {
  if (pending.toDeliver.length === 0) {
    return <Empty>No feedback is waiting to be delivered.</Empty>;
  }
  return (
    <div className="border border-border bg-background">
      <table className="w-full table-fixed">
        <caption className="sr-only">Feedback waiting to be delivered</caption>
        <colgroup>
          <col />
          <col className="w-[22%]" />
          <col className="w-[14%]" />
          <col className="w-[18%]" />
          <col className="w-[11%]" />
          {/* The button (v2: 170px of grid) plus the cell's padding. */}
          <col className="w-[204px]" />
        </colgroup>
        <thead>
          <tr className={headClass}>
            <th scope="col">Intern</th>
            <th scope="col">Feedback by</th>
            <th scope="col">Submitted</th>
            <th scope="col">Colour code</th>
            <th scope="col">Waiting</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {pending.toDeliver.map((row) => (
            <tr key={row.feedbackId} className={rowClass}>
              <td>
                <Intern batchId={row.batch.id} intern={row.intern} />
              </td>
              <td className="truncate text-muted-foreground">{row.author.name}</td>
              <td className="text-muted-foreground">{formatDay(row.submittedAt)}</td>
              <td>
                <ColourChip code={row.colorCode} />
              </td>
              <td className="text-muted-foreground">{waitingFor(row.submittedAt)}</td>
              <td className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Record conversation for ${row.intern.name}, feedback by ${row.author.name}`}
                  onClick={() =>
                    onOpen({
                      action: 'record',
                      batchId: row.batch.id,
                      internId: row.intern.id,
                      feedbackId: row.feedbackId,
                    })
                  }
                >
                  Record conversation
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
