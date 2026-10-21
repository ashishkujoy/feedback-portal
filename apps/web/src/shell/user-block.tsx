import { roleLabels, primaryRole } from '../identity/roles.ts';
import { Avatar } from '../ui/avatar.tsx';
import { useMe } from './use-me.ts';

/** The foot of the sidebar: who is signed in. Rendered only once `/me` says so. */
export const UserBlock = () => {
  const me = useMe();
  if (!me) return null;
  const role = primaryRole(me.roles);
  return (
    <div className="mt-auto flex items-center gap-2.5 border-t border-white/14 px-2 py-3">
      <Avatar name={me.name} src={me.avatarUrl} size="sm" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium text-white">{me.name}</span>
        {role ? <span className="text-xs text-tech-blue-100">{roleLabels[role]}</span> : null}
      </div>
    </div>
  );
};
