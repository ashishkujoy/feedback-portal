import { describe, expect, it } from 'vitest';
import { ColorCode, colorCodeSeverity, compareColorCodes } from './color-code.ts';

describe('colorCodeSeverity', () => {
  it('ranks every code 1–6 in data-model order', () => {
    expect(ColorCode.options.map((code) => colorCodeSeverity[code])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(colorCodeSeverity)).toBe(true);
  });
});

describe('compareColorCodes', () => {
  it('sorts least severe first, with "no code" before green', () => {
    const shuffled: (ColorCode | null)[] = [
      'red',
      null,
      'nearly_yellow',
      'green',
      'nearly_red',
      'orange',
      'yellow',
    ];
    expect(shuffled.toSorted(compareColorCodes)).toEqual([
      null,
      'green',
      'yellow',
      'nearly_yellow',
      'orange',
      'nearly_red',
      'red',
    ]);
  });

  it('treats equal codes as equal', () => {
    expect(compareColorCodes('orange', 'orange')).toBe(0);
    expect(compareColorCodes(null, null)).toBe(0);
  });
});
