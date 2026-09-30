import { describe, expect, it } from 'vitest';
import { InternStatus, isFinalStatus } from './intern-status.ts';

describe('isFinalStatus', () => {
  it.each([
    ['active', false],
    ['on_notice', false],
    ['graduated', true],
    ['terminated', true],
    ['withdrawn', true],
  ] as const)('%s → %s', (status, expected) => {
    expect(isFinalStatus(status)).toBe(expected);
  });

  it('covers every status', () => {
    expect(InternStatus.options).toHaveLength(5);
  });
});
