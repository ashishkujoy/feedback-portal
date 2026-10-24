import { describe, expect, it } from 'vitest';
import {
  ChangeStatusRequest,
  CreateInternRequest,
  InternDetail,
  InternSummary,
  maxPhotoBytes,
  PhotoUploadTicket,
  SetPhotoRequest,
} from './intern.ts';

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
      photoUrl: null,
    };
    expect(InternSummary.parse(intern)).toEqual(intern);
  });
});

describe('InternDetail', () => {
  const actor = { id: '01890a5d-ac96-774b-bcce-b302099a8059', name: 'Pat Manager' };
  const detail = {
    id: '01890a5d-ac96-774b-bcce-b302099a8057',
    batchId: '01890a5d-ac96-774b-bcce-b302099a8058',
    username: 'ishita.rao',
    name: 'Ishita Rao',
    email: 'ishita@example.com',
    status: 'active',
    colorCode: null,
    noticeEndsOn: null,
    photoUrl: 'https://res.cloudinary.com/demo/image/upload/c_fill/x',
    phone: null,
    diplomaBranch: 'Mechanical',
    parentNames: null,
    interviewNotes: '**Strong** in maths',
    source: 'manual',
    createdAt: '2027-01-11T09:00:00.000Z',
    addedBy: actor,
    statusEvents: [
      {
        id: '01890a5d-ac96-774b-bcce-b302099a8060',
        fromStatus: null,
        toStatus: 'active',
        reason: null,
        noticeStartsOn: null,
        noticeEndsOn: null,
        actor,
        createdAt: '2027-01-11T09:00:00.000Z',
      },
    ],
  };

  it('accepts a profile with its onboarding event', () => {
    expect(InternDetail.parse(detail)).toEqual(detail);
  });

  it('rejects an unknown source', () => {
    expect(InternDetail.safeParse({ ...detail, source: 'csv' }).success).toBe(false);
  });
});

describe('ChangeStatusRequest', () => {
  it('trims the reason and knows the four actions', () => {
    expect(ChangeStatusRequest.parse({ action: 'graduate', reason: '  Done \n' })).toEqual({
      action: 'graduate',
      reason: 'Done',
    });
    expect(ChangeStatusRequest.safeParse({ action: 'give_notice', reason: 'x' }).success).toBe(
      false,
    );
  });

  it('asks for a reason', () => {
    expect(
      ChangeStatusRequest.safeParse({ action: 'withdraw', reason: ' \n ' }).error?.issues[0]
        ?.message,
    ).toBe('Add a reason.');
  });
});

describe('photo uploads', () => {
  it('describe a ticket and the answer to save', () => {
    expect(
      PhotoUploadTicket.parse({
        uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
        apiKey: 'key',
        timestamp: 1_800_000_000,
        signature: 'abc',
        publicId: 'feedback-portal/interns/i1/p1',
        allowedFormats: 'jpg,png',
      }).publicId,
    ).toBe('feedback-portal/interns/i1/p1');
    expect(
      SetPhotoRequest.safeParse({ publicId: 'x', version: 0, signature: 's', bytes: 1 }).success,
    ).toBe(false);
    expect(maxPhotoBytes).toBe(5_242_880);
  });
});
