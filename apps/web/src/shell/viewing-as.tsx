import { primaryRole, roleLabels } from '../identity/roles.ts';
import { Tag } from '../ui/tag.tsx';
import { useMe } from './use-me.ts';

/** "Viewing as <role>" on the right of the top bar, once `/me` is known. */
export const ViewingAs = () => {
  const role = primaryRole(useMe()?.roles ?? []);
  if (!role) return null;
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
      Viewing as
      <Tag>{roleLabels[role]}</Tag>
    </div>
  );
};
