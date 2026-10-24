/** Kuat Progress: a 6px rounded bar on slate 200, filled in EE Blue (a native `progress`). */
export const Progress = ({ value, label }: Readonly<{ value: number; label: string }>) => (
  <progress
    aria-label={label}
    max={100}
    value={Math.max(0, Math.min(100, Math.round(value)))}
    className="h-1.5 w-full appearance-none overflow-hidden rounded-full bg-(--slate-200) [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-(--brand-ee-blue) [&::-webkit-progress-bar]:bg-(--slate-200) [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-(--brand-ee-blue) [&::-webkit-progress-value]:transition-[width] [&::-webkit-progress-value]:duration-240"
  />
);
