import { z } from 'zod';

export const ColorCode = z.enum([
  'green',
  'yellow',
  'nearly_yellow',
  'orange',
  'nearly_red',
  'red',
]);
export type ColorCode = z.infer<typeof ColorCode>;

/** Severity order: 1 is the best performance, 6 the most at risk. */
export const colorCodeSeverity: Readonly<Record<ColorCode, number>> = Object.freeze({
  green: 1,
  yellow: 2,
  nearly_yellow: 3,
  orange: 4,
  nearly_red: 5,
  red: 6,
});

/**
 * Sort comparator, least severe first. `null` means "no code yet" and sorts
 * before green, because every intern starts without a code.
 */
export const compareColorCodes = (a: ColorCode | null, b: ColorCode | null): number =>
  (a === null ? 0 : colorCodeSeverity[a]) - (b === null ? 0 : colorCodeSeverity[b]);
