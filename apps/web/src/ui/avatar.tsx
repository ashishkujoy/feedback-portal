import { useState } from 'react';

const sizes = {
  sm: 'size-7 text-[11.2px]',
  md: 'size-9 text-[14.4px]',
  lg: 'size-12 text-[19.2px]',
  xl: 'size-16 text-[25.6px]',
} as const;

/** Up to two letters: the first of the first and last words. */
export const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase() || '?';
};

type AvatarProps = Readonly<{
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}>;

/**
 * Kuat Avatar: a round image, or initials on EE Blue 100 (40% of the size, semibold). Initials
 * also stand in when the image can't be loaded.
 */
export const Avatar = ({ name, src, size = 'md', className = '' }: AvatarProps) => {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = src && failed !== src;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-ee-blue-100 font-semibold text-ee-blue-700 select-none ${sizes[size]} ${className}`}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
        />
      ) : (
        <span aria-hidden>{initialsOf(name)}</span>
      )}
    </span>
  );
};
