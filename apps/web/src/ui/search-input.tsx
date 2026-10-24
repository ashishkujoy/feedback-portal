import { Search } from 'lucide-react';
import { TextInput } from './text-input.tsx';

type SearchInputProps = Readonly<{
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** The box's width; the design's search fields are 260px unless full width. */
  className?: string;
}>;

const searchIcon = <Search size={16} />;

/** Kuat Input (md) with a search icon. */
export const SearchInput = ({
  label,
  placeholder,
  value,
  onChange,
  className = 'w-[260px]',
}: SearchInputProps) => (
  <TextInput
    type="search"
    aria-label={label}
    placeholder={placeholder}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    leftIcon={searchIcon}
    className={className}
  />
);
