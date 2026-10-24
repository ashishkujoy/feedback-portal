import { z } from 'zod';

/** Tuple form, for consumers that need the literal list (e.g. the Postgres enum). */
export const colorCodes = [
  'green',
  'yellow',
  'borderline_yellow',
  'orange',
  'borderline_red',
  'red',
] as const;

export const ColorCode = z.enum(colorCodes);
export type ColorCode = z.infer<typeof ColorCode>;

/** Severity order: 1 is the best performance, 6 the most at risk. */
export const colorCodeSeverity: Readonly<Record<ColorCode, number>> = Object.freeze({
  green: 1,
  yellow: 2,
  borderline_yellow: 3,
  orange: 4,
  borderline_red: 5,
  red: 6,
});

/**
 * Sort comparator, least severe first. `null` means "no code yet" and sorts
 * before green, because every intern starts without a code.
 */
export const compareColorCodes = (a: ColorCode | null, b: ColorCode | null): number =>
  (a === null ? 0 : colorCodeSeverity[a]) - (b === null ? 0 : colorCodeSeverity[b]);
