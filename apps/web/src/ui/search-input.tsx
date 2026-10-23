import { Search } from 'lucide-react';

type SearchInputProps = Readonly<{
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}>;

/** Kuat Input (md) with a search icon: 36px high, focus ring on the field. */
export const SearchInput = ({ label, placeholder, value, onChange }: SearchInputProps) => (
  <div className="flex h-9 w-[260px] items-center gap-2 rounded-sm border border-border bg-input px-3 transition-[border-color,box-shadow] focus-within:border-ring focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)]">
    <Search aria-hidden size={16} className="shrink-0 text-muted-foreground" />
    <input
      type="search"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
    />
  </div>
);
