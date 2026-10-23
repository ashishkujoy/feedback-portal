import { describe, expect, it } from 'vitest';
import { BatchDetail, CreateBatchRequest } from './batch.ts';

const pmId = '01890a5d-ac96-774b-bcce-b302099a8057';

describe('CreateBatchRequest', () => {
  it('trims the name', () => {
    expect(
      CreateBatchRequest.parse({
        name: ' Batch 1 ',
        startDate: '2027-01-11',
        endDate: '2028-06-25',
        programManagerId: pmId,
      }),
    ).toEqual({
      name: 'Batch 1',
      startDate: '2027-01-11',
      endDate: '2028-06-25',
      programManagerId: pmId,
    });
  });

  it('reports every invalid field', () => {
    const result = CreateBatchRequest.safeParse({
      name: ' ',
      startDate: '2027-02-30',
      endDate: '',
      programManagerId: '',
    });

    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['name', 'Name is required'],
      ['startDate', 'Start date must be a valid date'],
      ['endDate', 'End date must be a valid date'],
      ['programManagerId', 'Choose a programme manager'],
    ]);
  });

  it('needs the end date after the start', () => {
    const result = CreateBatchRequest.safeParse({
      name: 'Batch 1',
      startDate: '2027-01-11',
      endDate: '2027-01-11',
      programManagerId: pmId,
    });

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'End date must be after the start date',
    ]);
  });
});

describe('BatchDetail', () => {
  it('accepts a batch with current and past members', () => {
    const person = { id: pmId, name: 'A PM', avatarUrl: null };
    const detail = {
      id: '01890a5d-ac96-774b-bcce-b30209000001',
      name: 'Batch 1',
      startDate: '2027-01-11',
      endDate: '2028-06-25',
      isArchived: false,
      programManager: person,
      mentorCount: 0,
      members: [
        {
          id: '01890a5d-ac96-774b-bcce-b30209000002',
          user: { ...person, isActive: true },
          role: 'program_manager',
          assignedAt: '2027-01-11T09:00:00.000Z',
          unassignedAt: null,
        },
      ],
    };

    expect(BatchDetail.parse(detail)).toEqual(detail);
    expect(BatchDetail.safeParse({ ...detail, startDate: '11 Jan 2027' }).success).toBe(false);
  });
});
