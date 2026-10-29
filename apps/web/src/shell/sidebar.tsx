import { useQuery } from '@tanstack/react-query';
import { Inbox, Layers, Users } from 'lucide-react';
import { pendingQuery } from '../api/pending.ts';
import { useSettings } from '../branding/use-settings.ts';
import { batchesLabel, isAdmin } from '../identity/roles.ts';
import { badgeCount } from '../pending/pending.ts';
import { NavItem } from './nav-item.tsx';
import { useMe } from './use-me.ts';
import { UserBlock } from './user-block.tsx';

/**
 * The design's 240px Tech Blue sidebar, with the signed-in user at its foot. The program name
 * comes from `/settings`; the design's logo mark is left out (no organisation's brand is
 * hard-coded).
 */
export const Sidebar = () => {
  const me = useMe();
  const settings = useSettings();
  const pending = useQuery(pendingQuery).data;
  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar px-3 py-5">
      <div className="flex flex-col gap-0.5 px-2 pt-1 pb-6">
        {settings ? (
          <span className="text-base font-semibold tracking-[-0.2px] text-white">
            {settings.programName}
          </span>
        ) : null}
        <span className="text-xs text-tech-blue-100">Mentor portal</span>
      </div>
      <div className="px-2.5 py-2 text-[11px] tracking-[0.08em] text-tech-blue-200 uppercase">
        Workspace
      </div>
      <nav aria-label="Main">
        <ul className="flex flex-col gap-0.5">
          <NavItem to="/batches" icon={Layers} label={me ? batchesLabel(me) : 'Batches'} />
          <NavItem
            to="/pending"
            icon={Inbox}
            label="My pending"
            count={me && pending ? badgeCount(me, pending) : undefined}
          />
          {me && isAdmin(me) ? <NavItem to="/users" icon={Users} label="Users and roles" /> : null}
        </ul>
      </nav>
      <UserBlock />
    </aside>
  );
};
