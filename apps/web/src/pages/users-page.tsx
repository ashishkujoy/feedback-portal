import type { AdminUser, Role } from '@feedback-portal/contracts';
import { useQuery } from '@tanstack/react-query';
import { meQuery } from '../api/me.ts';
import { getRouteApi } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { usersQuery } from '../api/users.ts';
import { isApiError } from '../api/errors.ts';
import { Button } from '../ui/button.tsx';
import { Callout } from '../ui/callout.tsx';
import { PageTitle } from '../ui/page-title.tsx';
import { SearchInput } from '../ui/search-input.tsx';
import { type TabItem, tabId, Tabs } from '../ui/tabs.tsx';
import { AddUserDialog } from '../users/add-user-dialog.tsx';
import { byName, byRole, matches, tabCounts } from '../users/filter-users.ts';
import { cells, UserRow } from '../users/user-row.tsx';

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

type Failure = Readonly<{ name: string; error: Error }>;

/** A12 · Users and roles (admins only): roles edited in place, Remove/Reactivate, and A13 · Add user. */
export const UsersPage = () => {
  const { role, q = '' } = route.useSearch();
  const navigate = route.useNavigate();
  const { data: users, error } = useQuery(usersQuery);
  const me = useQuery(meQuery).data;
  const [adding, setAdding] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
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
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden size={16} strokeWidth={2} />
          Add user
        </Button>
      </div>
      <AddUserDialog open={adding} onClose={() => setAdding(false)} />
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
        {failure ? (
          <div role="alert">
            <Callout type="issue" title={`We couldn't update ${failure.name}`}>
              {isApiError(failure.error) ? failure.error.detail : undefined}
            </Callout>
          </div>
        ) : null}
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
              <col className="w-[216px]" />
              <col className="w-[124px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-(--slate-50) text-left text-xs text-muted-foreground [&>th]:font-medium">
                <th scope="col" className={cells.name}>
                  Name
                </th>
                <th scope="col" className={cells.email}>
                  Email
                </th>
                <th scope="col" className={cells.roles}>
                  Roles
                </th>
                <th scope="col" className={cells.action}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown?.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelf={user.id === me?.id}
                  onFailed={(failed, reason) => setFailure({ name: failed.name, error: reason })}
                  onChanged={() => setFailure(null)}
                />
              ))}
              {shown?.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-sm text-muted-foreground">
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
