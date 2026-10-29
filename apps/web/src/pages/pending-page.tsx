import type { MeResponse, MyPending } from '@feedback-portal/contracts';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';
import { isApiError } from '../api/errors.ts';
import { pendingQuery } from '../api/pending.ts';
import { type PendingTab, shownTab, subtitle, tabItems } from '../pending/pending.ts';
import { type Opening, PendingDialog } from '../pending/pending-dialog.tsx';
import { DraftsPanel, NeedsFeedbackPanel, ToDeliverPanel } from '../pending/pending-panels.tsx';
import { useMe } from '../shell/use-me.ts';
import { Callout } from '../ui/callout.tsx';
import { PageTitle } from '../ui/page-title.tsx';
import { Skeleton } from '../ui/skeleton.tsx';
import { tabId, Tabs } from '../ui/tabs.tsx';

const route = getRouteApi('/app/pending');

const panelId = 'pending-panel';

/** Kuat Skeletons in the table's shape while the lists load. */
const PendingSkeleton = () => (
  <div
    className="flex flex-col gap-3 border border-border bg-background p-4"
    aria-busy="true"
    aria-label="Loading your pending work"
  >
    {[0, 1, 2, 3].map((key) => (
      <Skeleton key={key} className="h-5 w-full" />
    ))}
  </div>
);

const Panel = ({
  tab,
  pending,
  me,
  onOpen,
}: Readonly<{
  tab: PendingTab;
  pending: MyPending;
  me: MeResponse;
  onOpen: (opening: Opening) => void;
}>) => {
  if (tab === 'deliver') return <ToDeliverPanel pending={pending} onOpen={onOpen} />;
  if (tab === 'drafts') return <DraftsPanel pending={pending} onOpen={onOpen} />;
  return <NeedsFeedbackPanel pending={pending} meId={me.id} onOpen={onOpen} />;
};

/**
 * v2 M26 / P26 · My pending (11.2): a PM's To deliver, then Needs feedback and Drafts, each row's
 * dialog opened here. The first tab is the default, so it stays out of the URL.
 */
export const PendingPage = () => {
  const { tab: asked } = route.useSearch();
  const navigate = route.useNavigate();
  const me = useMe();
  const { data: pending, error } = useQuery(pendingQuery);
  const [opening, setOpening] = useState<Opening | null>(null);
  if (!me) return null;
  const tab = shownTab(me, asked);
  return (
    <>
      <div className="flex flex-col gap-1">
        <PageTitle>My pending</PageTitle>
        {pending ? (
          <p className="text-sm text-muted-foreground">{subtitle(me, pending.month)}</p>
        ) : null}
      </div>
      <Tabs
        label="Pending work"
        items={tabItems(me, pending)}
        value={tab}
        controls={panelId}
        onChange={(next) => {
          void navigate({
            search: { tab: next === shownTab(me, undefined) ? undefined : next },
          });
        }}
      />
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(panelId, tab)}>
        {error ? (
          <Callout type="issue" title="We couldn't load your pending work">
            {isApiError(error) ? error.detail : undefined}
          </Callout>
        ) : pending ? (
          <Panel tab={tab} pending={pending} me={me} onOpen={setOpening} />
        ) : (
          <PendingSkeleton />
        )}
      </div>
      {opening && pending ? (
        <PendingDialog opening={opening} month={pending.month} onClose={() => setOpening(null)} />
      ) : null}
    </>
  );
};
