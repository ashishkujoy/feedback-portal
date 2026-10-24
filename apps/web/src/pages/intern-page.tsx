import { useQuery } from '@tanstack/react-query';
import type { StatusAction } from '@feedback-portal/contracts';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';
import { batchQuery } from '../api/batches.ts';
import { isApiError } from '../api/errors.ts';
import { internQuery } from '../api/interns.ts';
import { today } from '../batches/batch-dates.ts';
import { InternDetails } from '../interns/profile/intern-details.tsx';
import { SidePanel } from '../interns/profile/side-panel.tsx';
import { statusButtonsFor } from '../interns/profile/status-actions.ts';
import { StatusDialog } from '../interns/profile/status-dialog.tsx';
import { StatusHistory } from '../interns/profile/status-history.tsx';
import { finalBanner, firstName, noticeBanner, statusBadges } from '../interns/profile.ts';
import { useMe } from '../shell/use-me.ts';
import { Avatar } from '../ui/avatar.tsx';
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

/** A6-nofeedback, without Give feedback until Phase 9 (7.5 decision 2). */
const TimelinePlaceholder = ({ name }: Readonly<{ name: string }>) => (
  <div className="flex flex-col items-center gap-2 border border-dashed border-(--slate-300) bg-background px-6 py-14 text-center">
    <p className="text-base font-semibold">No feedback yet</p>
    <p className="max-w-[420px] text-sm text-muted-foreground">
      Feedback, conversations, comments and status changes for {firstName(name)} appear here, newest
      first.
    </p>
  </div>
);

/**
 * P6 / M6 / P22 / P23 · an intern's profile: the header and banners, the Timeline (a placeholder
 * until feedback), Details and Status history tabs, and the side panel. The batch's PM gets the
 * status changes (7.6); the photo and Give feedback come with their tasks.
 */
export const InternPage = () => {
  const { batchId, internId } = route.useParams();
  const { tab = 'timeline' } = route.useSearch();
  const navigate = route.useNavigate();
  const { data: intern, error } = useQuery(internQuery(batchId, internId));
  const { data: batch } = useQuery(batchQuery(batchId));
  const me = useMe();
  const [changing, setChanging] = useState<StatusAction | null>(null);

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

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={intern.name} size="xl" />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <PageTitle>{intern.name}</PageTitle>
              <StatusBadge type={badge.type}>{badge.label}</StatusBadge>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">@{intern.username}</span>
              <span aria-hidden>·</span>
              <span>{batch.name}</span>
            </p>
          </div>
        </div>
        {buttons.length > 0 ? (
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
          </div>
        ) : null}
      </div>
      <StatusDialog intern={intern} action={changing} onClose={() => setChanging(null)} />
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
          {tab === 'timeline' ? <TimelinePlaceholder name={intern.name} /> : null}
          {tab === 'details' ? <InternDetails intern={intern} /> : null}
          {tab === 'history' ? <StatusHistory intern={intern} /> : null}
        </div>
        <SidePanel intern={intern} batch={batch} today={on} />
      </div>
    </>
  );
};
