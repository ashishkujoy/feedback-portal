import { describe, expect, it } from 'vitest';
import { ConversationContentRequest } from './conversation.ts';

const issues = (value: unknown) =>
  ConversationContentRequest.safeParse(value).error?.issues.map(({ path, message }) => [
    path.join('.'),
    message,
  ]);

describe('ConversationContentRequest', () => {
  it('takes the day and the notes', () => {
    const content = { heldOn: '2026-10-20', notes: 'Delivered in the weekly 1:1.' };
    expect(ConversationContentRequest.parse(content)).toEqual(content);
  });

  it('explains a missing date and notes that are blank or too long', () => {
    expect(issues({ heldOn: '', notes: ' \n' })).toEqual([
      ['heldOn', 'Choose the date it was delivered.'],
      ['notes', 'Write how the conversation went.'],
    ]);
    expect(issues({ heldOn: '2026-10-20', notes: 'x'.repeat(20_001) })).toEqual([
      ['notes', 'Notes must be at most 20000 characters'],
    ]);
  });
});
