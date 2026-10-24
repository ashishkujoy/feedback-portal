import type { BatchMemberView } from '@feedback-portal/contracts';
import { Avatar } from '../ui/avatar.tsx';
import { Button } from '../ui/button.tsx';
import { StatusBadge } from '../ui/status-badge.tsx';
import { formatDay } from './batch-dates.ts';

const roleLabels = { mentor: 'Mentor', program_manager: 'Programme manager' } as const;

// A4's table: header 10px 16px, 12/500 muted on slate-50; rows 12px 16px, 14px; 16px gaps.
const firstCell = 'py-3 pr-2 pl-4';
const middleCell = 'px-2 py-3';
const lastCell = 'py-3 pr-4 pl-2';
const headerRow =
  'border-b border-border bg-(--slate-50) text-left text-xs text-muted-foreground [&>th]:py-2.5 [&>th]:font-medium';

const Person = ({ user }: Readonly<{ user: BatchMemberView['user'] }>) => (
  <div className="flex items-center gap-2.5">
    <Avatar name={user.name} src={user.avatarUrl} size="sm" />
    <span className={`truncate font-medium ${user.isActive ? '' : 'text-muted-foreground'}`}>
      {user.name}
    </span>
    {user.isActive ? null : <StatusBadge>Inactive</StatusBadge>}
  </div>
);

type TableProps = Readonly<{ members: readonly BatchMemberView[] }>;

type MentorsTableProps = TableProps &
  Readonly<{
    /** For the batch's managers: A4's Remove, which unassigns the mentor. */
    onRemove?: ((member: BatchMemberView) => void) | undefined;
    /** Blocks Remove while a change is saving. */
    busy?: boolean;
  }>;

const isCurrent = (member: BatchMemberView) => member.unassignedAt === null;

export const hasPastMembers = (members: readonly BatchMemberView[]): boolean =>
  members.some((member) => !isCurrent(member));

/**
 * A4's Mentors table for a batch's members: its current mentors with Mentor, Email, and when they
 * were assigned (feedback columns: Phase 8).
 */
export const MentorsTable = ({ members: all, onRemove, busy = false }: MentorsTableProps) => {
  const members = all.filter((member) => isCurrent(member) && member.role === 'mentor');
  // A4's 110px action column (plus its cell padding), only for managers.
  const assignedCell = onRemove ? middleCell : lastCell;
  return (
    <table className="w-full table-fixed border border-border bg-background">
      <caption className="sr-only">Mentors</caption>
      <colgroup>
        <col className="w-2/5" />
        <col className="w-2/5" />
        <col className="w-1/5" />
        {onRemove ? <col className="w-[134px]" /> : null}
      </colgroup>
      <thead>
        <tr className={headerRow}>
          <th scope="col" className={firstCell}>
            Mentor
          </th>
          <th scope="col" className={middleCell}>
            Email
          </th>
          <th scope="col" className={assignedCell}>
            Assigned
          </th>
          {onRemove ? (
            <th scope="col" className={lastCell}>
              <span className="sr-only">Actions</span>
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {members.map((member) => (
          <tr key={member.id} className="border-b border-border text-sm">
            <td className={firstCell}>
              <Person user={member.user} />
            </td>
            <td className={`${middleCell} truncate text-muted-foreground`}>{member.user.email}</td>
            <td className={`${assignedCell} text-muted-foreground`}>
              {formatDay(member.assignedAt)}
            </td>
            {onRemove ? (
              <td className={lastCell}>
                <div className="flex justify-end">
                  <Button
                    variant="ghost-muted"
                    size="sm"
                    disabled={busy}
                    aria-label={`Remove ${member.user.name}`}
                    onClick={() => onRemove(member)}
                  >
                    Remove
                  </Button>
                </div>
              </td>
            ) : null}
          </tr>
        ))}
        {members.length === 0 ? (
          <tr>
            <td colSpan={onRemove ? 4 : 3} className="px-4 py-3 text-sm text-muted-foreground">
              No mentors yet.
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
};

/**
 * Not in the design (6.5 decision 2): a batch's past members, i.e. mentors who left and replaced
 * PMs, in A4's style.
 */
export const PastMembersTable = ({ members: all }: TableProps) => {
  const members = all.filter((member) => !isCurrent(member));
  return (
    <table className="w-full table-fixed border border-border bg-background">
      <caption className="sr-only">Past members</caption>
      <colgroup>
        <col className="w-2/5" />
        <col className="w-1/5" />
        <col className="w-1/5" />
        <col className="w-1/5" />
      </colgroup>
      <thead>
        <tr className={headerRow}>
          <th scope="col" className={firstCell}>
            Member
          </th>
          <th scope="col" className={middleCell}>
            Role
          </th>
          <th scope="col" className={middleCell}>
            Assigned
          </th>
          <th scope="col" className={lastCell}>
            Unassigned
          </th>
        </tr>
      </thead>
      <tbody>
        {members.map((member) => (
          <tr key={member.id} className="border-b border-border text-sm">
            <td className={firstCell}>
              <Person user={member.user} />
            </td>
            <td className={middleCell}>{roleLabels[member.role]}</td>
            <td className={`${middleCell} text-muted-foreground`}>
              {formatDay(member.assignedAt)}
            </td>
            <td className={`${lastCell} text-muted-foreground`}>
              {member.unassignedAt ? formatDay(member.unassignedAt) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
