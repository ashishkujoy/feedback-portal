import { Avatar } from './avatar.tsx';

type Person = Readonly<{ id: string; name: string; avatarUrl: string | null }>;

type AvatarStackProps = Readonly<{
  people: readonly Person[];
  /** How many avatars before "+N". */
  max?: number;
  /** Names the group for screen readers, e.g. "Mentors". */
  label: string;
}>;

/**
 * Kuat AvatarStack (sm): 28px avatars overlapping by 30% with a 2px `--background` ring, then a
 * "+N" disc (`slate-200` / `slate-600`) for the rest. Screen readers get the names as text.
 */
export const AvatarStack = ({ people, max = 5, label }: AvatarStackProps) => {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="inline-flex">
      <span className="sr-only">{`${label}: ${people.map((person) => person.name).join(', ')}`}</span>
      <span aria-hidden className="inline-flex items-center [&>*+*]:-ml-[8.4px]">
        {shown.map((person) => (
          <span
            key={person.id}
            className="inline-flex rounded-full shadow-[0_0_0_2px_var(--background)]"
            title={person.name}
          >
            <Avatar name={person.name} src={person.avatarUrl} size="sm" />
          </span>
        ))}
        {extra > 0 ? (
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-(--slate-200) text-[9.52px] font-semibold text-(--slate-600) shadow-[0_0_0_2px_var(--background)]">
            +{extra}
          </span>
        ) : null}
      </span>
    </span>
  );
};
