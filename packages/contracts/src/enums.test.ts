import { describe, expect, it } from 'vitest';
import { BatchMemberRole, ColorCode, FeedbackState, InternStatus, Role } from './index.ts';

const cases = [
  ['Role', Role, ['admin', 'mentor', 'program_manager']],
  ['BatchMemberRole', BatchMemberRole, ['mentor', 'program_manager']],
  ['ColorCode', ColorCode, ['green', 'yellow', 'nearly_yellow', 'orange', 'nearly_red', 'red']],
  ['InternStatus', InternStatus, ['active', 'on_notice', 'graduated', 'terminated', 'withdrawn']],
  ['FeedbackState', FeedbackState, ['draft', 'submitted', 'delivered']],
] as const;

describe.each(cases)('%s', (_name, schema, expected) => {
  it('lists exactly the values from the data model', () => {
    expect(schema.options).toEqual(expected);
  });

  it.each(expected)('accepts %s', (value) => {
    expect(schema.parse(value)).toBe(value);
  });

  it('rejects unknown values', () => {
    expect(schema.safeParse('unknown').success).toBe(false);
    expect(schema.safeParse(undefined).success).toBe(false);
  });
});
