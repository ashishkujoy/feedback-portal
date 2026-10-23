import { Search } from 'lucide-react';
import { TextInput } from './text-input.tsx';

type SearchInputProps = Readonly<{
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}>;

const searchIcon = <Search size={16} />;

/** Kuat Input (md) with a search icon, 260px wide. */
export const SearchInput = ({ label, placeholder, value, onChange }: SearchInputProps) => (
  <TextInput
    type="search"
    aria-label={label}
    placeholder={placeholder}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    leftIcon={searchIcon}
    className="w-[260px]"
  />
);
