import { describe, expect, it } from 'vitest';
import { CommentRequest } from './comment.ts';

const issues = (value: unknown) =>
  CommentRequest.safeParse(value).error?.issues.map(({ path, message }) => [
    path.join('.'),
    message,
  ]);

describe('CommentRequest', () => {
  it('keeps the body exactly as typed', () => {
    expect(CommentRequest.parse({ body: '  Agree.\nShe paired twice. ' })).toEqual({
      body: '  Agree.\nShe paired twice. ',
    });
  });

  it('explains a blank or too long body', () => {
    expect(issues({ body: ' \n' })).toEqual([['body', 'Write a comment.']]);
    expect(issues({ body: 'x'.repeat(2_001) })).toEqual([
      ['body', 'Comments must be at most 2000 characters'],
    ]);
    expect(issues({ body: 'x'.repeat(2_000) })).toBeUndefined();
  });
});
