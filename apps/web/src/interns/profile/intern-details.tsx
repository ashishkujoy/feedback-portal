import type { InternDetail } from '@feedback-portal/contracts';
import { Markdown } from '../../ui/markdown.tsx';
import { addedText } from '../profile.ts';
import { SectionCard } from './section-card.tsx';

const missing = '—';

/**
 * P22 · the Details tab: the fields in two columns (with Edit details for the batch's managers),
 * then the interview notes as Markdown.
 */
type InternDetailsProps = Readonly<{
  intern: InternDetail;
  /** For the batch's managers while the record isn't read-only: A15's Edit details. */
  onEdit?: (() => void) | undefined;
}>;

export const InternDetails = ({ intern, onEdit }: InternDetailsProps) => {
  const fields: readonly (readonly [string, string])[] = [
    ['Username', `@${intern.username}`],
    ['Email', intern.email],
    ['Phone', intern.phone ?? missing],
    ['Diploma branch', intern.diplomaBranch ?? missing],
    ["Parents' names", intern.parentNames ?? missing],
    ['Added', addedText(intern)],
  ];
  return (
    <>
      <SectionCard title="Details" actionLabel="Edit details" onAction={onEdit}>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-5 p-5">
          {fields.map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>
      <SectionCard title="Interview notes">
        <div className="px-5 pt-4 pb-[18px]">
          {intern.interviewNotes ? (
            <Markdown>{intern.interviewNotes}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">No interview notes.</p>
          )}
        </div>
      </SectionCard>
    </>
  );
};
