import { describe, expect, it } from 'vitest';
import { CreateInternRequest, InternSummary } from './intern.ts';

describe('CreateInternRequest', () => {
  it('normalises the fields', () => {
    expect(
      CreateInternRequest.parse({
        username: ' @Ishita.Rao ',
        name: ' Ishita Rao ',
        email: ' Ishita@Example.COM ',
        phone: '  ',
        diplomaBranch: ' Mechanical ',
        interviewNotes: '',
      }),
    ).toEqual({
      username: 'ishita.rao',
      name: 'Ishita Rao',
      email: 'ishita@example.com',
      phone: null,
      diplomaBranch: 'Mechanical',
      parentNames: null,
      interviewNotes: null,
    });
  });

  it('reports every invalid field', () => {
    const result = CreateInternRequest.safeParse({
      username: '@',
      name: ' ',
      email: 'nope',
      phone: 'x'.repeat(51),
      interviewNotes: 'x'.repeat(20_001),
    });

    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['username', 'Username is required'],
      ['name', 'Name is required'],
      ['email', 'Invalid email address'],
      ['phone', 'Phone must be at most 50 characters'],
      ['interviewNotes', 'Interview notes must be at most 20000 characters'],
    ]);
  });

  it('rejects usernames with other characters', () => {
    expect(
      CreateInternRequest.safeParse({ username: 'ishita rao', name: 'I', email: 'i@example.com' })
        .error?.issues[0]?.message,
    ).toBe('Username can only contain letters, digits, ".", "_" and "-"');
  });
});

describe('InternSummary', () => {
  it('accepts an intern without a colour code or notice', () => {
    const intern = {
      id: '01890a5d-ac96-774b-bcce-b302099a8057',
      batchId: '01890a5d-ac96-774b-bcce-b302099a8058',
      username: 'ishita.rao',
      name: 'Ishita Rao',
      email: 'ishita@example.com',
      status: 'active',
      colorCode: null,
      noticeEndsOn: null,
    };
    expect(InternSummary.parse(intern)).toEqual(intern);
  });
});
