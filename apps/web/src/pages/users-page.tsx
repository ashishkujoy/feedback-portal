import type { AdminUser, Role } from '@feedback-portal/contracts';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { usersQuery } from '../api/users.ts';
import { isApiError } from '../api/errors.ts';
import { roleLabels, rolesByPrivilege } from '../identity/roles.ts';
import { Avatar } from '../ui/avatar.tsx';
import { Callout } from '../ui/callout.tsx';
import { PageTitle } from '../ui/page-title.tsx';
import { SearchInput } from '../ui/search-input.tsx';
import { StatusBadge } from '../ui/status-badge.tsx';
import { type TabItem, tabId, Tabs } from '../ui/tabs.tsx';
import { byName, byRole, matches, tabCounts } from '../users/filter-users.ts';

const route = getRouteApi('/app/users');

type Tab = 'all' | Role;

const panelId = 'users-panel';

const tabItems = (users: readonly AdminUser[] | undefined): TabItem<Tab>[] => {
  const counts = users ? tabCounts(users) : undefined;
  return [
    { value: 'all', label: 'All', count: counts?.all },
    { value: 'admin', label: 'Admins', count: counts?.admin },
    { value: 'program_manager', label: 'Programme managers', count: counts?.program_manager },
    { value: 'mentor', label: 'Mentors', count: counts?.mentor },
  ];
};

// The design's grid (2fr 2fr 200px, 16px gaps and side padding) as table cells.
const nameCell = 'py-2.5 pr-2 pl-4';
const emailCell = 'px-2 py-2.5';
const roleCell = 'py-2.5 pr-4 pl-2';

const UserRow = ({ user }: Readonly<{ user: AdminUser }>) => (
  <tr className="border-b border-border text-sm">
    <td className={nameCell}>
      <div className="flex items-center gap-2.5">
        <Avatar name={user.name} src={user.avatarUrl} size="sm" />
        <span className={`truncate font-medium ${user.isActive ? '' : 'text-muted-foreground'}`}>
          {user.name}
        </span>
        {user.isActive ? null : <StatusBadge>Inactive</StatusBadge>}
      </div>
    </td>
    <td className={`${emailCell} truncate text-muted-foreground`}>{user.email}</td>
    <td className={roleCell}>
      {rolesByPrivilege(user.roles)
        .map((role) => roleLabels[role])
        .join(', ')}
    </td>
  </tr>
);

/** A12 · Users and roles (admins only). Read-only until 5.2 (add) and 5.3 (roles, deactivate). */
export const UsersPage = () => {
  const { role, q = '' } = route.useSearch();
  const navigate = route.useNavigate();
  const { data: users, error } = useQuery(usersQuery);
  const tab: Tab = role ?? 'all';
  const shown = users ? byName(byRole(users, role).filter((user) => matches(user, q))) : undefined;

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <PageTitle>Users and roles</PageTitle>
          <p className="text-sm text-muted-foreground">
            Admins manage the portal. Programme managers run their batches and record conversations.
            Mentors give feedback and comment.
          </p>
        </div>
      </div>
      <Tabs
        label="Roles"
        items={tabItems(users)}
        value={tab}
        controls={panelId}
        onChange={(next) => {
          void navigate({
            search: (prev) => ({ ...prev, role: next === 'all' ? undefined : next }),
          });
        }}
      />
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(panelId, tab)}
        className="flex flex-col gap-6"
      >
        <SearchInput
          label="Search users"
          placeholder="Search by name or email"
          value={q}
          onChange={(next) => {
            void navigate({
              search: (prev) => ({ ...prev, q: next === '' ? undefined : next }),
              replace: true,
            });
          }}
        />
        {error ? (
          <Callout type="issue" title="We couldn't load users">
            {isApiError(error) ? error.detail : undefined}
          </Callout>
        ) : (
          <table className="w-full table-fixed border border-border bg-background">
            <caption className="sr-only">Users</caption>
            <colgroup>
              <col />
              <col />
              <col className="w-[224px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-(--slate-50) text-left text-xs text-muted-foreground [&>th]:font-medium">
                <th scope="col" className={nameCell}>
                  Name
                </th>
                <th scope="col" className={emailCell}>
                  Email
                </th>
                <th scope="col" className={roleCell}>
                  Role
                </th>
              </tr>
            </thead>
            <tbody>
              {shown?.map((user) => (
                <UserRow key={user.id} user={user} />
              ))}
              {shown?.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 text-sm text-muted-foreground">
                    No users match your search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
};
