import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { type FeedbackView, isFinalStatus, type StatusAction } from '@feedback-portal/contracts';
import { getRouteApi } from '@tanstack/react-router';
import { MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { batchQuery } from '../api/batches.ts';
import { isApiError } from '../api/errors.ts';
import { feedbackQuery } from '../api/feedback.ts';
import { internQuery } from '../api/interns.ts';
import { today } from '../batches/batch-dates.ts';
import { canWriteFeedback } from '../batches/can-write-feedback.ts';
import { GiveFeedbackDialog } from '../interns/give-feedback-dialog.tsx';
import { DiscardDraftDialog } from '../interns/profile/discard-draft-dialog.tsx';
import { EditDetailsDialog } from '../interns/profile/edit-details-dialog.tsx';
import { latestColouredOn } from '../interns/profile/feedback-entry.ts';
import {
  FeedbackTimeline,
  FeedbackTimelineSkeleton,
} from '../interns/profile/feedback-timeline.tsx';
import { InternDetails } from '../interns/profile/intern-details.tsx';
import {
  PhotoButton,
  PhotoProgress,
  ProfileAvatar,
  usePhotoUpload,
} from '../interns/profile/photo-control.tsx';
import { SidePanel } from '../interns/profile/side-panel.tsx';
import { statusButtonsFor } from '../interns/profile/status-actions.ts';
import { StatusDialog } from '../interns/profile/status-dialog.tsx';
import { StatusHistory } from '../interns/profile/status-history.tsx';
import { finalBanner, firstName, noticeBanner, statusBadges } from '../interns/profile.ts';
import { canManageBatch } from '../batches/can-manage.ts';
import { useSettings } from '../branding/use-settings.ts';
import { useMe } from '../shell/use-me.ts';
import { Button } from '../ui/button.tsx';
import { Callout } from '../ui/callout.tsx';
import { PageTitle } from '../ui/page-title.tsx';
import { StatusBadge } from '../ui/status-badge.tsx';
import { type TabItem, tabId, Tabs } from '../ui/tabs.tsx';

const route = getRouteApi('/app/batches/$batchId/interns/$internId');

type Tab = 'timeline' | 'details' | 'history';

const panelId = 'intern-panel';

const tabItems = (changes: number): TabItem<Tab>[] => [
  { value: 'timeline', label: 'Timeline' },
  { value: 'details', label: 'Details' },
  { value: 'history', label: 'Status history', count: changes },
];

/** Give feedback: primary, with v2's `message-square`. */
const GiveFeedbackButton = ({ onClick }: Readonly<{ onClick: () => void }>) => (
  <Button onClick={onClick}>
    <MessageSquare aria-hidden size={16} strokeWidth={2} />
    Give feedback
  </Button>
);

type TimelinePlaceholderProps = Readonly<{
  name: string;
  onGiveFeedback: (() => void) | undefined;
}>;

/** A6-nofeedback, with Give feedback for those who write it (9.5). */
const TimelinePlaceholder = ({ name, onGiveFeedback }: TimelinePlaceholderProps) => (
  <div className="flex flex-col items-center gap-2 border border-dashed border-(--slate-300) bg-background px-6 py-14 text-center">
    <p className="text-base font-semibold">No feedback yet</p>
    <p className="max-w-[420px] text-sm text-muted-foreground">
      Feedback, conversations, comments and status changes for {firstName(name)} appear here, newest
      first.
    </p>
    {onGiveFeedback ? (
      <div className="mt-2">
        <GiveFeedbackButton onClick={onGiveFeedback} />
      </div>
    ) : null}
  </div>
);

type TimelineProps = Readonly<{
  name: string;
  feedback: Pick<UseQueryResult<FeedbackView[]>, 'data' | 'error'>;
  onGiveFeedback: (() => void) | undefined;
  onContinue: ((draft: FeedbackView) => void) | undefined;
  onDiscard: ((draft: FeedbackView) => void) | undefined;
}>;

/** The Timeline tab: the feedback, or A6-nofeedback when there's none. */
const Timeline = ({ name, feedback, onGiveFeedback, onContinue, onDiscard }: TimelineProps) => {
  if (feedback.error) {
    return (
      <Callout type="issue" title="We couldn't load the feedback">
        {isApiError(feedback.error) ? feedback.error.detail : undefined}
      </Callout>
    );
  }
  if (!feedback.data) return <FeedbackTimelineSkeleton />;
  return feedback.data.length === 0 ? (
    <TimelinePlaceholder name={name} onGiveFeedback={onGiveFeedback} />
  ) : (
    <FeedbackTimeline entries={feedback.data} onContinue={onContinue} onDiscard={onDiscard} />
  );
};

/**
 * P6 / M6 / P22 / P23 · an intern's profile: the header and banners, the Timeline (feedback and
 * the viewer's drafts, 9.6), Details and Status history tabs, and the side panel. The batch's PM
 * gets the status changes (7.6); its PM and current mentors give feedback (9.5).
 */
export const InternPage = () => {
  const { batchId, internId } = route.useParams();
  const { tab = 'timeline' } = route.useSearch();
  const navigate = route.useNavigate();
  const { data: intern, error } = useQuery(internQuery(batchId, internId));
  const { data: batch } = useQuery(batchQuery(batchId));
  const me = useMe();
  const settings = useSettings();
  const [changing, setChanging] = useState<StatusAction | null>(null);
  const photo = usePhotoUpload({ id: internId, batchId });
  const [editing, setEditing] = useState(false);
  // The feedback dialog: `{}` for new feedback, `{ draft }` to carry on with one; `null` closed.
  const [writing, setWriting] = useState<Readonly<{ draft?: FeedbackView }> | null>(null);
  const [discarding, setDiscarding] = useState<FeedbackView | null>(null);
  const feedback = useQuery(feedbackQuery(batchId, internId));

  if (error) {
    return (
      <Callout type="issue" title="We couldn't load this intern">
        {isApiError(error) ? error.detail : undefined}
      </Callout>
    );
  }
  if (!intern || !batch) return null;

  const on = today();
  const badge = statusBadges[intern.status];
  const notice = noticeBanner(intern, on, batch.programManager.name);
  const final = finalBanner(intern);
  const buttons = me ? statusButtonsFor(me, batch, intern) : [];
  // A6-photo: the batch's managers (7.7 decision 1), photos on, and the record not read-only.
  // The batch's managers fix details (7.9 decision 1) while the record isn't read-only.
  const canEdit = me ? canManageBatch(me, batch) && final === null : false;
  const canPhoto = settings?.photos === true && canEdit;
  // A read-only record takes no feedback (9.5 decision 1).
  const canFeedback = me ? canWriteFeedback(me, batch) && !isFinalStatus(intern.status) : false;
  const giveFeedback = canFeedback ? () => setWriting({}) : undefined;

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <ProfileAvatar intern={intern} uploading={photo.state.kind === 'uploading'} />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <PageTitle>{intern.name}</PageTitle>
              <StatusBadge type={badge.type}>{badge.label}</StatusBadge>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">@{intern.username}</span>
              <span aria-hidden>·</span>
              <span>{batch.name}</span>
              {canPhoto && photo.state.kind !== 'uploading' ? (
                <>
                  <span aria-hidden>·</span>
                  <PhotoButton
                    hasPhoto={intern.photoUrl !== null}
                    onFile={(file) => void photo.start(file)}
                  />
                </>
              ) : null}
            </p>
            {photo.state.kind === 'uploading' ? (
              <PhotoProgress
                fileName={photo.state.fileName}
                percent={photo.state.percent}
                onCancel={photo.cancel}
              />
            ) : null}
            {photo.state.kind === 'error' ? (
              <p role="alert" className="text-xs text-destructive">
                {photo.state.message}
              </p>
            ) : null}
          </div>
        </div>
        {buttons.length > 0 || giveFeedback ? (
          <div className="flex gap-2">
            {buttons.map((button) => (
              <Button
                key={button.action}
                variant={button.variant}
                onClick={() => setChanging(button.action)}
              >
                {button.label}
              </Button>
            ))}
            {giveFeedback ? <GiveFeedbackButton onClick={giveFeedback} /> : null}
          </div>
        ) : null}
      </div>
      <StatusDialog intern={intern} action={changing} onClose={() => setChanging(null)} />
      {canFeedback ? (
        <GiveFeedbackDialog
          intern={intern}
          batch={batch}
          open={writing !== null}
          draft={writing?.draft}
          onClose={() => setWriting(null)}
        />
      ) : null}
      <DiscardDraftDialog intern={intern} draft={discarding} onClose={() => setDiscarding(null)} />
      {canEdit ? (
        <EditDetailsDialog
          intern={intern}
          batchName={batch.name}
          open={editing}
          onClose={() => setEditing(false)}
        />
      ) : null}
      {notice ? (
        <Callout type="warning" title={notice.title}>
          {notice.description}
        </Callout>
      ) : null}
      {final ? (
        <Callout type="info" title={final.title}>
          {final.description}
        </Callout>
      ) : null}
      <Tabs
        label="Intern"
        items={tabItems(intern.statusEvents.length)}
        value={tab}
        controls={panelId}
        onChange={(next) => {
          void navigate({ search: { tab: next === 'timeline' ? undefined : next } });
        }}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-6">
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabId(panelId, tab)}
          className="flex min-w-0 flex-col gap-4"
        >
          {tab === 'timeline' ? (
            <Timeline
              name={intern.name}
              feedback={feedback}
              onGiveFeedback={giveFeedback}
              onContinue={canFeedback ? (draft) => setWriting({ draft }) : undefined}
              onDiscard={canFeedback ? setDiscarding : undefined}
            />
          ) : null}
          {tab === 'details' ? (
            <InternDetails intern={intern} onEdit={canEdit ? () => setEditing(true) : undefined} />
          ) : null}
          {tab === 'history' ? <StatusHistory intern={intern} /> : null}
        </div>
        <SidePanel
          intern={intern}
          batch={batch}
          today={on}
          colouredOn={feedback.data ? latestColouredOn(feedback.data) : null}
          feedback={feedback.data}
        />
      </div>
    </>
  );
};
