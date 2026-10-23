import type { AdminUser, Role } from '@feedback-portal/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  deactivateUser,
  reactivateUser,
  replaceUser,
  setUserRoles,
  usersQuery,
} from '../api/users.ts';
import { roleLabels, rolesByPrivilege } from '../identity/roles.ts';
import { Avatar } from '../ui/avatar.tsx';
import { Button } from '../ui/button.tsx';
import { Dialog } from '../ui/dialog.tsx';
import { type MultiSelectOption, MultiSelect } from '../ui/multi-select.tsx';
import { StatusBadge } from '../ui/status-badge.tsx';

// The design's grid (2fr 2fr 200px 100px, 16px gaps and side padding) as table cells.
export const cells = {
  name: 'py-2.5 pr-2 pl-4',
  email: 'px-2 py-2.5',
  roles: 'px-2 py-2.5',
  action: 'py-2.5 pr-4 pl-2',
} as const;

const allRoles: readonly Role[] = ['admin', 'program_manager', 'mentor'];

/** What the API would refuse, disabled up front with the reason. */
const roleOptions = (user: AdminUser, isSelf: boolean): MultiSelectOption<Role>[] =>
  allRoles.map((role) => {
    const held = user.roles.includes(role);
    const ownAdmin = isSelf && role === 'admin' && held;
    const onlyRole = held && user.roles.length === 1;
    return {
      value: role,
      label: roleLabels[role],
      disabled: ownAdmin || onlyRole,
      hint: ownAdmin
        ? "You can't remove your own admin role"
        : onlyRole
          ? 'A user needs at least one role; remove them instead'
          : undefined,
    };
  });

type Change =
  | Readonly<{ kind: 'roles'; roles: Role[] }>
  | Readonly<{ kind: 'deactivate' }>
  | Readonly<{ kind: 'reactivate' }>;

type UserRowProps = Readonly<{
  user: AdminUser;
  isSelf: boolean;
  onFailed: (user: AdminUser, error: Error) => void;
  onChanged: () => void;
}>;

/** One user: roles editable in place, and Remove (with a confirmation) or Reactivate. */
export const UserRow = ({ user, isSelf, onFailed, onChanged }: UserRowProps) => {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const change = useMutation({
    mutationFn: (next: Change) => {
      if (next.kind === 'roles') return setUserRoles(user.id, next.roles);
      return next.kind === 'deactivate' ? deactivateUser(user.id) : reactivateUser(user.id);
    },
    onSuccess: (updated) => {
      // The API's answer goes straight into the list: the row and the tab counts update at once.
      replaceUser(queryClient, updated);
      setConfirming(false);
      onChanged();
    },
    onError: (error) => {
      setConfirming(false);
      onFailed(user, error);
      // Someone else may have changed this user; show what the server has.
      void queryClient.invalidateQueries({ queryKey: usersQuery.queryKey });
    },
  });
  const saving = change.isPending;

  return (
    <tr className="border-b border-border text-sm">
      <td className={cells.name}>
        <div className="flex items-center gap-2.5">
          <Avatar name={user.name} src={user.avatarUrl} size="sm" />
          <span className={`truncate font-medium ${user.isActive ? '' : 'text-muted-foreground'}`}>
            {user.name}
          </span>
          {user.isActive ? null : <StatusBadge>Inactive</StatusBadge>}
        </div>
      </td>
      <td className={`${cells.email} truncate text-muted-foreground`}>{user.email}</td>
      <td className={cells.roles}>
        <MultiSelect
          label={`Roles for ${user.name}`}
          options={roleOptions(user, isSelf)}
          value={rolesByPrivilege(user.roles)}
          disabled={saving}
          onToggle={(role) => {
            const roles = user.roles.includes(role)
              ? user.roles.filter((held) => held !== role)
              : [...user.roles, role];
            change.mutate({ kind: 'roles', roles: rolesByPrivilege(roles) });
          }}
        />
      </td>
      <td className={cells.action}>
        <div className="flex justify-end">
          {isSelf ? null : (
            <Button
              variant="ghost-muted"
              size="sm"
              disabled={saving}
              aria-label={`${user.isActive ? 'Remove' : 'Reactivate'} ${user.name}`}
              onClick={() => {
                if (user.isActive) setConfirming(true);
                else change.mutate({ kind: 'reactivate' });
              }}
            >
              {user.isActive ? 'Remove' : 'Reactivate'}
            </Button>
          )}
        </div>
        <Dialog
          open={confirming}
          onClose={() => setConfirming(false)}
          title={`Remove ${user.name}?`}
          description="They're signed out and can't sign in. Their feedback and comments stay, and you can add them back."
        >
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => change.mutate({ kind: 'deactivate' })}
            >
              {saving ? 'Removing…' : 'Remove'}
            </Button>
          </div>
        </Dialog>
      </td>
    </tr>
  );
};
