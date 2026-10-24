import type { BatchDetail, FeedbackView, InternDetail } from '@feedback-portal/contracts';
import type { CSSProperties } from 'react';
import { AvatarStack } from '../../ui/avatar-stack.tsx';
import { colourTones } from '../colour-chip.tsx';
import { colourSummary, noticePeriod } from '../profile.ts';
import { ColourHistoryCard } from './colour-history-card.tsx';
import { colourHistory, historyEnd } from './colour-history.ts';
import { PanelCard } from './section-card.tsx';

const barStyle = (share: number): CSSProperties => ({ width: `${Math.round(share * 100)}%` });

type SidePanelProps = Readonly<{
  intern: InternDetail;
  batch: Pick<BatchDetail, 'mentors' | 'mentorCount' | 'startDate'>;
  today: string;
  /** When the newest coloured feedback was submitted ("8 Oct 2026"), once the feedback has loaded. */
  colouredOn: string | null;
  /** The intern's feedback, once loaded: the colour history comes from it (9.7 decision 1). */
  feedback: readonly FeedbackView[] | undefined;
}>;

/**
 * A6's side panel: the colour code (with when it was set, and the notice period while on notice),
 * its history once there is one, and the batch's mentors.
 */
export const SidePanel = ({ intern, batch, today, colouredOn, feedback }: SidePanelProps) => {
  const colour = colourSummary(intern.colorCode, colouredOn);
  const notice = noticePeriod(intern, today);
  const history = colourHistory(feedback ?? []);
  const end = historyEnd(intern, today);
  return (
    <aside className="flex flex-col gap-4">
      <PanelCard label="Colour code">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={`size-3.5 rounded-full ${colourTones[intern.colorCode ?? 'none'].dot}`}
          />
          <span className="text-xl font-semibold tracking-[-0.3px]">{colour.label}</span>
        </div>
        <p className="text-[13px] leading-5 text-muted-foreground">{colour.note}</p>
        {notice ? (
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex justify-between text-[13px]">
              <span className="font-medium">Notice period</span>
              <span className="text-muted-foreground">{notice.label}</span>
            </div>
            <div aria-hidden className="h-1.5 bg-(--slate-100)">
              <div className="h-1.5 bg-equal-ember-500" style={barStyle(notice.share)} />
            </div>
          </div>
        ) : null}
      </PanelCard>
      {history.length > 0 ? (
        <ColourHistoryCard
          history={history}
          start={batch.startDate}
          end={end}
          endsToday={end === today}
        />
      ) : null}
      <PanelCard label="Mentors">
        <AvatarStack label="Mentors" people={batch.mentors} max={6} />
        <p className="text-[13px] text-muted-foreground">
          {batch.mentorCount === 0
            ? 'No mentors assigned yet.'
            : `${batch.mentorCount} ${batch.mentorCount === 1 ? 'mentor' : 'mentors'} in this batch`}
        </p>
      </PanelCard>
    </aside>
  );
};
