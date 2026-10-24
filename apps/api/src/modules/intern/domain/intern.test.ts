import { type InternStatus, internStatuses } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../../shared/errors/app-error.ts';
import { newBatchId } from '../../cohort/domain/batch-id.ts';
import { newUserId } from '../../identity/domain/user-id.ts';
import {
  type ChangeInput,
  currentNotice,
  type DetailsInput,
  giveNotice,
  graduate,
  type Intern,
  isReadOnly,
  liftNotice,
  onboardIntern,
  refreshFromAirtable,
  setColorCode,
  terminate,
  updateDetails,
  withdraw,
} from './intern.ts';
import { newInternId } from './intern-id.ts';
import { newStatusEventId } from './status-event-id.ts';

const t0 = new Date('2027-01-11T09:00:00Z');
const t1 = new Date('2027-04-01T09:00:00Z');
const t2 = new Date('2027-05-01T09:00:00Z');
const pm = newUserId();
const mentor = newUserId();

const details: DetailsInput = {
  username: 'ishita.rao',
  name: 'Ishita Rao',
  email: 'ishita@example.com',
};

const errorOf = (action: () => unknown): AppError => {
  try {
    action();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('expected an AppError');
};

const onboard = (input: DetailsInput = details) =>
  onboardIntern({
    id: newInternId(),
    eventId: newStatusEventId(),
    batchId: newBatchId(),
    details: input,
    actor: pm,
    now: t0,
  });

const change = (reason = 'Discussed in the 1:1', now = t1): ChangeInput => ({
  eventId: newStatusEventId(),
  reason,
  actor: pm,
  now,
});

const notice = (intern: Intern, startsOn = '2027-04-01') =>
  giveNotice(intern, {
    ...change('Missed every deadline in March'),
    actor: mentor,
    startsOn,
    feedbackId: null,
  });

/** Moves an intern into `to` with the matching operation. */
const moveTo = (intern: Intern, to: InternStatus, now = t2): Intern => {
  switch (to) {
    case 'on_notice':
      return giveNotice(intern, {
        ...change('Notice', now),
        startsOn: '2027-05-01',
        feedbackId: null,
      });
    case 'active':
      return liftNotice(intern, change('Lifted', now));
    case 'terminated':
      return terminate(intern, change('Terminated', now));
    case 'graduated':
      return graduate(intern, change('Graduated', now));
    case 'withdrawn':
      return withdraw(intern, change('Withdrew', now));
  }
};

/** An intern in `status`, reached through allowed changes only. */
const internIn = (status: InternStatus): Intern => {
  const active = onboard();
  switch (status) {
    case 'active':
      return active;
    case 'on_notice':
      return notice(active);
    case 'terminated':
      return terminate(notice(active), change('Terminated'));
    case 'graduated':
      return graduate(active, change('Completed the program'));
    case 'withdrawn':
      return withdraw(active, change('Took another offer'));
  }
};

/** PRODUCT §10, written out independently of the implementation's table. */
const allowed = new Set([
  'active→on_notice',
  'active→graduated',
  'active→withdrawn',
  'on_notice→active',
  'on_notice→terminated',
  'on_notice→withdrawn',
]);
const finalStatuses = new Set<InternStatus>(['graduated', 'terminated', 'withdrawn']);

const pairs = internStatuses.flatMap((from) => internStatuses.map((to) => [from, to] as const));
const allowedPairs = pairs.filter(([from, to]) => allowed.has(`${from}→${to}`));
const rejectedPairs = pairs
  .filter(([from, to]) => !allowed.has(`${from}→${to}`))
  .map(
    ([from, to]) =>
      [
        from,
        to,
        finalStatuses.has(from) ? 'intern_read_only' : 'invalid_status_transition',
      ] as const,
  );

describe('the status state machine', () => {
  it('covers all 25 pairs: 6 allowed, 19 rejected', () => {
    expect([pairs.length, allowedPairs.length, rejectedPairs.length]).toEqual([25, 6, 19]);
  });

  it.each(allowedPairs)('allows %s → %s', (from, to) => {
    const after = moveTo(internIn(from), to);

    expect(after.status).toBe(to);
    expect(after.statusEvents.at(-1)).toMatchObject({
      fromStatus: from,
      toStatus: to,
      actorId: pm,
      createdAt: t2,
    });
    expect(after.noticeEndsOn).toBe(to === 'on_notice' ? '2027-06-01' : null);
    expect(after.updatedAt).toBe(t2);
  });

  it.each(rejectedPairs)('rejects %s → %s with %s', (from, to, code) => {
    const error = errorOf(() => moveTo(internIn(from), to));

    expect(error).toMatchObject({ kind: 'conflict', code });
  });
});

describe('onboardIntern', () => {
  it('starts active, with an onboarding event that has no previous status or reason', () => {
    const intern = onboard();

    expect(intern).toMatchObject({ status: 'active', colorCode: null, noticeEndsOn: null });
    expect(intern.statusEvents).toEqual([
      {
        id: expect.any(String),
        fromStatus: null,
        toStatus: 'active',
        reason: null,
        noticeStartsOn: null,
        noticeEndsOn: null,
        feedbackId: null,
        actorId: pm,
        createdAt: t0,
      },
    ]);
  });

  it('normalises the details', () => {
    const intern = onboard({
      username: ' @Ishita.Rao ',
      name: ' Ishita Rao ',
      email: ' Ishita@Example.COM ',
      phone: '  ',
      diplomaBranch: ' Mechanical ',
      interviewNotes: '',
    });

    expect(intern).toMatchObject({
      username: 'ishita.rao',
      name: 'Ishita Rao',
      email: 'ishita@example.com',
      phone: null,
      diplomaBranch: 'Mechanical',
      parentNames: null,
      interviewNotes: null,
    });
  });

  it('reports every invalid detail together', () => {
    const error = errorOf(() =>
      onboard({ username: 'ishita rao!', name: ' ', email: 'nope', phone: 'x'.repeat(51) }),
    );

    expect(error.code).toBe('validation_failed');
    expect(error.issues?.map((issue) => issue.path)).toEqual([
      'username',
      'name',
      'email',
      'phone',
    ]);
  });
});

describe('reasons', () => {
  it.each(['', '   ', '\n\t'])('are required for every change (%j)', (reason) => {
    const active = onboard();
    const onNotice = notice(active);

    for (const action of [
      () => giveNotice(active, { ...change(reason), startsOn: '2027-04-01', feedbackId: null }),
      () => liftNotice(onNotice, change(reason)),
      () => terminate(onNotice, change(reason)),
      () => graduate(active, change(reason)),
      () => withdraw(active, change(reason)),
    ]) {
      expect(errorOf(action).issues).toEqual([{ path: 'reason', message: 'Add a reason.' }]);
    }
  });

  it('are trimmed', () => {
    expect(
      graduate(onboard(), change('  Completed the program \n')).statusEvents.at(-1)?.reason,
    ).toBe('Completed the program');
  });
});

describe('notice', () => {
  it('runs one calendar month from its start, and keeps the feedback that gave it', () => {
    const feedbackId = '01890a5d-ac96-774b-bcce-b302099a8057';
    const intern = giveNotice(onboard(), {
      ...change('Marked as notice in feedback'),
      startsOn: '2027-04-01',
      feedbackId,
    });

    expect(intern.noticeEndsOn).toBe('2027-05-01');
    expect(currentNotice(intern)).toMatchObject({
      noticeStartsOn: '2027-04-01',
      noticeEndsOn: '2027-05-01',
      feedbackId,
    });
  });

  it('clamps to the end of a shorter month', () => {
    expect(notice(onboard(), '2027-01-31').noticeEndsOn).toBe('2027-02-28');
    expect(notice(onboard(), '2028-01-31').noticeEndsOn).toBe('2028-02-29');
  });

  it('needs a valid start date', () => {
    expect(errorOf(() => notice(onboard(), '2027-02-30')).issues).toEqual([
      { path: 'noticeStartsOn', message: 'Notice start must be a valid date' },
    ]);
  });

  it('ends when lifted, terminated or withdrawn', () => {
    const onNotice = notice(onboard());

    for (const after of [
      liftNotice(onNotice, change()),
      terminate(onNotice, change()),
      withdraw(onNotice, change()),
    ]) {
      expect(after.noticeEndsOn).toBeNull();
      expect(currentNotice(after)).toBeUndefined();
      expect(after.statusEvents.at(-1)).toMatchObject({ noticeStartsOn: null, noticeEndsOn: null });
    }
  });

  it('can be given again after being lifted', () => {
    const again = notice(liftNotice(notice(onboard()), change()), '2027-06-01');

    expect(currentNotice(again)?.noticeStartsOn).toBe('2027-06-01');
    expect(again.statusEvents.map((event) => event.toStatus)).toEqual([
      'active',
      'on_notice',
      'active',
      'on_notice',
    ]);
  });
});

describe('read-only interns', () => {
  it.each(['graduated', 'terminated', 'withdrawn'] as const)(
    'can no longer be edited once %s',
    (status) => {
      const intern = internIn(status);

      expect(isReadOnly(intern)).toBe(true);
      expect(errorOf(() => updateDetails(intern, { details, now: t2 })).code).toBe(
        'intern_read_only',
      );
    },
  );

  it('updates the details of an active or on-notice intern', () => {
    for (const intern of [onboard(), notice(onboard())]) {
      const updated = updateDetails(intern, {
        details: { ...details, name: 'Ishita R.', interviewNotes: '**Strong** in maths' },
        now: t2,
      });
      expect(isReadOnly(intern)).toBe(false);
      expect(updated).toMatchObject({
        name: 'Ishita R.',
        interviewNotes: '**Strong** in maths',
        status: intern.status,
        updatedAt: t2,
      });
    }
  });
});

describe('history', () => {
  it('only ever appends: earlier events stay the same objects', () => {
    const active = onboard();
    const onNotice = notice(active);
    const lifted = liftNotice(onNotice, change());

    expect(lifted.statusEvents).toHaveLength(3);
    expect(lifted.statusEvents[0]).toBe(active.statusEvents[0]);
    expect(lifted.statusEvents[1]).toBe(onNotice.statusEvents[1]);
    expect(lifted.statusEvents[1]?.actorId).toBe(mentor);
  });
});

describe('refreshFromAirtable', () => {
  it("replaces the mapped fields, keeps the username, status and history, and sets Airtable's", () => {
    const onNotice = notice(
      updateDetails(onboard(), {
        details: { ...details, phone: '+91 1', diplomaBranch: 'Mechanical' },
        now: t1,
      }),
    );

    const refreshed = refreshFromAirtable(onNotice, {
      details: {
        username: 'someone.else',
        name: 'Ishita R.',
        email: 'IR@example.com',
        phone: null,
      },
      airtableRecordId: 'recA1b2C3d4E5f6G7',
      airtableFields: { Username: 'ishita.rao', Extra: 1 },
      now: t2,
    });

    expect(refreshed).toMatchObject({
      username: 'ishita.rao',
      name: 'Ishita R.',
      email: 'ir@example.com',
      phone: null,
      diplomaBranch: null,
      status: 'on_notice',
      airtableRecordId: 'recA1b2C3d4E5f6G7',
      airtableFields: { Username: 'ishita.rao', Extra: 1 },
      updatedAt: t2,
    });
    expect(refreshed.statusEvents).toBe(onNotice.statusEvents);
  });

  it('refuses a read-only intern', () => {
    expect(
      errorOf(() =>
        refreshFromAirtable(internIn('graduated'), {
          details,
          airtableRecordId: 'recA1b2C3d4E5f6G7',
          airtableFields: {},
          now: t2,
        }),
      ).code,
    ).toBe('intern_read_only');
  });
});

describe('setColorCode', () => {
  it('sets the code from submitted feedback, leaving status and history alone', () => {
    const intern = onboard();

    const coloured = setColorCode(intern, { colorCode: 'borderline_red', now: t2 });

    expect(coloured).toMatchObject({
      colorCode: 'borderline_red',
      status: 'active',
      updatedAt: t2,
    });
    expect(coloured.statusEvents).toBe(intern.statusEvents);
  });

  it('refuses a read-only intern', () => {
    expect(
      errorOf(() => setColorCode(internIn('terminated'), { colorCode: 'red', now: t2 })).code,
    ).toBe('intern_read_only');
  });
});
