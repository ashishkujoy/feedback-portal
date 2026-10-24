import type { InternDetail } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { userWith } from '../../test/stub-api.ts';
import { dialogCopy, statusButtonsFor } from './status-actions.ts';

const me = userWith(['program_manager']);
const ownBatch = {
  programManager: { id: me.id, name: me.name, avatarUrl: null },
  isArchived: false,
};

const intern = (overrides: Partial<InternDetail> = {}): InternDetail => ({
  id: '01890a5d-ac96-774b-bcce-b302099a8057',
  batchId: '01890a5d-ac96-774b-bcce-b302099a8058',
  username: 'ishita.rao',
  name: 'Ishita Rao',
  email: 'ishita@example.com',
  status: 'active',
  colorCode: null,
  noticeEndsOn: null,
  photoUrl: null,
  phone: null,
  diplomaBranch: null,
  parentNames: null,
  interviewNotes: null,
  source: 'manual',
  createdAt: '2026-07-07T09:00:00.000Z',
  addedBy: { id: me.id, name: me.name },
  statusEvents: [],
  ...overrides,
});

const labels = (buttons: ReturnType<typeof statusButtonsFor>) =>
  buttons.map((button) => `${button.label} (${button.variant})`);

describe('statusButtonsFor', () => {
  it("offers v2's buttons to the batch's PM: active, then on notice", () => {
    expect(labels(statusButtonsFor(me, ownBatch, intern()))).toEqual([
      'Withdraw (ghost-muted)',
      'Graduate (outline)',
    ]);
    expect(labels(statusButtonsFor(me, ownBatch, intern({ status: 'on_notice' })))).toEqual([
      'Withdraw (ghost-muted)',
      'Terminate (destructive)',
      'Lift notice (outline)',
    ]);
  });

  it('offers nothing once final, to anyone else, or in an archived batch', () => {
    const others = {
      ...ownBatch,
      programManager: { ...ownBatch.programManager, id: 'someone-else' },
    };
    expect(
      [
        statusButtonsFor(me, ownBatch, intern({ status: 'graduated' })),
        statusButtonsFor(me, ownBatch, intern({ status: 'terminated' })),
        statusButtonsFor(me, ownBatch, intern({ status: 'withdrawn' })),
        statusButtonsFor(userWith(['admin']), others, intern()),
        statusButtonsFor(me, { ...ownBatch, isArchived: true }, intern()),
      ].map((buttons) => buttons.length),
    ).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('dialogCopy', () => {
  const onNotice = intern({
    status: 'on_notice',
    colorCode: 'red',
    statusEvents: [
      {
        id: '01890a5d-ac96-774b-bcce-b302099a8061',
        fromStatus: 'active',
        toStatus: 'on_notice',
        reason: 'x',
        noticeStartsOn: '2026-10-08',
        noticeEndsOn: '2026-11-08',
        actor: { id: me.id, name: me.name },
        createdAt: '2026-10-08T09:00:00.000Z',
      },
    ],
  });

  it('follows P18–P21, naming the intern instead of using pronouns', () => {
    expect(dialogCopy('lift_notice', onNotice)).toEqual({
      title: 'Lift notice for Ishita Rao',
      description: 'Ishita returns to Active.',
      points: [
        'The notice from 8 Oct 2026 stays in the status history.',
        'The colour code stays Red until new coloured feedback.',
      ],
      submit: 'Lift notice',
      submitVariant: 'primary',
      failure: "We couldn't lift the notice",
    });
    expect(dialogCopy('terminate', onNotice)).toMatchObject({
      title: 'Terminate Ishita Rao?',
      description: "This ends Ishita's place in the programme.",
      points: [
        "The status changes to Terminated. This can't be undone.",
        'The record becomes read-only. Feedback and conversations stay visible.',
      ],
      submit: 'Terminate intern',
      submitVariant: 'destructive',
    });
    expect(dialogCopy('graduate', intern())).toMatchObject({
      title: 'Graduate Ishita Rao',
      description: 'Use this when Ishita completes the programme.',
      points: [
        "The status changes to Graduated. This can't be undone.",
        'The record becomes read-only.',
      ],
      submit: 'Graduate',
    });
    expect(dialogCopy('withdraw', intern())).toMatchObject({
      title: 'Withdraw Ishita Rao',
      description: 'Use this when Ishita leaves the programme.',
      submit: 'Withdraw',
    });
  });

  it('never uses a pronoun', () => {
    const words = (['lift_notice', 'terminate', 'graduate', 'withdraw'] as const)
      .flatMap((action) => {
        const copy = dialogCopy(action, onNotice);
        return [copy.title, copy.description].concat(copy.points);
      })
      .join(' ');
    expect(words).not.toMatch(/\b(she|he|her|his|hers|him|they|their)\b/i);
  });

  it('explains a missing colour code when lifting', () => {
    expect(dialogCopy('lift_notice', { ...onNotice, colorCode: null }).points[1]).toBe(
      'There is no colour code until the first coloured feedback.',
    );
  });
});
