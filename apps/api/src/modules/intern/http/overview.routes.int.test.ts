import {
  BatchDetail,
  BatchOverview,
  FeedbackView,
  InternSummary,
  type Role,
} from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { realApp } from '../../../../test/app-deps.ts';
import { useTestDb } from '../../../../test/test-db.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;

type Setup = ReturnType<typeof realApp>;
type Who = Readonly<{ cookie: string }>;

const send = (
  { app, webAppUrl }: Setup,
  method: 'GET' | 'POST',
  who: Who,
  path: string,
  body?: unknown,
) =>
  app.request(path, {
    method,
    headers: {
      cookie: who.cookie,
      origin: webAppUrl,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const at = (day: number) => new Date(`2026-10-${String(day).padStart(2, '0')}T09:00:00Z`);

/**
 * A batch on 16–22 October 2026 (UTC; sessions last a week) with an unassigned admin, its PM, two mentors and a mentor
 * of another batch, and interns in every state: two on notice (Zoya's ending first), Kabir with
 * feedback awaiting delivery and delivered, Meera with none, and Tara (terminated), Wes
 * (withdrawn) and Gita (graduated) with colours of their own.
 */
const setUp = async () => {
  const setup = realApp(db());
  setup.setTime(at(16));
  const person = (name: string, roles: [Role, ...Role[]]) => setup.signedInUser({ name, roles });
  const admin = await person('Ada Admin', ['admin']);
  const pm = await person('Pat Manager', ['program_manager']);
  const mentor = await person('Mo Mentor', ['mentor']);
  const mentor2 = await person('Meg Mentor', ['mentor']);
  const outsider = await person('Oz Outsider', ['mentor']);
  const otherPm = await person('Olu Manager', ['program_manager']);
  const batchOf = async (name: string, pmId: string) =>
    BatchDetail.parse(
      await (
        await send(setup, 'POST', admin, '/batches', {
          name,
          startDate: '2026-07-06',
          endDate: '2027-12-18',
          programManagerId: pmId,
        })
      ).json(),
    );
  const batch = await batchOf('Batch 2026', pm.user.id);
  const other = await batchOf('Batch 2027', otherPm.user.id);
  await Promise.all([
    ...[mentor, mentor2].map(async (member) =>
      send(setup, 'POST', admin, `/batches/${batch.id}/mentors`, { userId: member.user.id }),
    ),
    send(setup, 'POST', admin, `/batches/${other.id}/mentors`, { userId: outsider.user.id }),
  ]);
  const internOf = async (batchId: string, username: string, name: string, who: Who = pm) =>
    InternSummary.parse(
      await (
        await send(setup, 'POST', who, `/batches/${batchId}/interns`, {
          username,
          name,
          email: `${username}@example.com`,
        })
      ).json(),
    );
  const [zoya, ishita, kabir, meera, tara, wes, gita] = await Promise.all(
    [
      ['zoya', 'Zoya Khan'],
      ['ishita', 'Ishita Rao'],
      ['kabir', 'Kabir Das'],
      ['meera', 'Meera Pillai'],
      ['tara', 'Tara Mathew'],
      ['wes', 'Wes Fernandes'],
      ['gita', 'Gita Nair'],
    ].map(async ([username = '', name = '']) => internOf(batch.id, username, name)),
  );
  if (!zoya || !ishita || !kabir || !meera || !tara || !wes || !gita) throw new Error('setup');
  const outside = await internOf(other.id, 'olga', 'Olga Ivanova', otherPm);
  const give = async (
    who: Who,
    internId: string,
    colorCode: string | null,
    options: Readonly<{ notice?: boolean; batchId?: string }> = {},
  ) => {
    const response = await send(
      setup,
      'POST',
      who,
      `/batches/${options.batchId ?? batch.id}/interns/${internId}/feedback`,
      {
        period: '2026-10-01',
        body: 'Closed `PAY-214` with tests first.',
        colorCode,
        givesNotice: options.notice ?? false,
        submit: true,
      },
    );
    expect(response.status).toBe(201);
    return FeedbackView.parse(await response.json());
  };
  const changeStatus = async (internId: string, action: string) =>
    expect(
      (
        await send(setup, 'POST', pm, `/batches/${batch.id}/interns/${internId}/status-changes`, {
          action,
          reason: 'Recorded for the overview test.',
        })
      ).status,
    ).toBe(200);

  // Zoya on notice from 16 Oct (ends 16 Nov), by Meg.
  const zoyaNotice = await give(mentor2, zoya.id, 'red', { notice: true });
  setup.setTime(at(17));
  // Tara on notice, then terminated; Wes and Gita coloured, then withdrawn and graduated.
  await give(mentor, tara.id, 'red', { notice: true });
  await changeStatus(tara.id, 'terminate');
  await give(mentor, wes.id, 'yellow');
  await changeStatus(wes.id, 'withdraw');
  await give(mentor, gita.id, 'yellow');
  await changeStatus(gita.id, 'graduate');
  // Kabir's first feedback, delivered on 18 Oct.
  setup.setTime(at(18));
  const delivered = await give(mentor, kabir.id, 'green');
  expect(
    (
      await send(setup, 'POST', pm, `/batches/${batch.id}/interns/${kabir.id}/conversations`, {
        feedbackId: delivered.id,
        heldOn: '2026-10-18',
        notes: 'Delivered in the weekly 1:1.',
      })
    ).status,
  ).toBe(201);
  // Ishita on notice from 20 Oct (ends 20 Nov), by Mo.
  setup.setTime(at(20));
  const ishitaNotice = await give(mentor, ishita.id, 'red', { notice: true });
  // Kabir's second, awaiting delivery; a draft; and another batch's feedback.
  setup.setTime(at(22));
  const awaiting = await give(mentor2, kabir.id, null);
  await send(setup, 'POST', mentor, `/batches/${batch.id}/interns/${meera.id}/feedback`, {
    period: '2026-10-01',
    body: 'A draft.',
    colorCode: 'orange',
    givesNotice: false,
  });
  await give(otherPm, outside.id, 'orange', { batchId: other.id });
  const overview = async (who: Who, batchId = batch.id) =>
    send(setup, 'GET', who, `/batches/${batchId}/overview`);
  return {
    setup,
    admin,
    pm,
    mentor,
    mentor2,
    outsider,
    batch,
    other,
    zoya,
    ishita,
    kabir,
    zoyaNotice,
    ishitaNotice,
    awaiting,
    overview,
  };
};

describe('GET /batches/:batchId/overview', () => {
  it('counts current interns by colour, lists who is on notice and what waits to be delivered', async () => {
    const context = await setUp();
    const response = await context.overview(context.pm);
    expect(response.status).toBe(200);
    const body = BatchOverview.parse(await response.json());

    // Gita (graduated) counts; Tara (terminated) and Wes (withdrawn) don't.
    expect(body).toMatchObject({
      current: 5,
      onNoticeCount: 2,
      colours: {
        green: 1,
        yellow: 1,
        borderline_yellow: 0,
        orange: 0,
        borderline_red: 0,
        red: 2,
        none: 1,
      },
    });
    expect(body.onNotice).toEqual([
      {
        intern: { id: context.zoya.id, name: 'Zoya Khan', photoUrl: null },
        noticeStartsOn: '2026-10-16',
        noticeEndsOn: '2026-11-16',
        issuedBy: { id: context.mentor2.user.id, name: 'Meg Mentor', avatarUrl: null },
      },
      {
        intern: { id: context.ishita.id, name: 'Ishita Rao', photoUrl: null },
        noticeStartsOn: '2026-10-20',
        noticeEndsOn: '2026-11-20',
        issuedBy: { id: context.mentor.user.id, name: 'Mo Mentor', avatarUrl: null },
      },
    ]);
    // Newest first: Kabir's awaiting entry, then the two notices' feedback. Delivered feedback,
    // drafts, read-only interns' feedback and the other batch's are left out.
    expect(body.toDeliver).toEqual([
      {
        feedbackId: context.awaiting.id,
        intern: { id: context.kabir.id, name: 'Kabir Das', photoUrl: null },
        author: { id: context.mentor2.user.id, name: 'Meg Mentor', avatarUrl: null },
        submittedAt: at(22).toISOString(),
        colorCode: null,
      },
      expect.objectContaining({
        feedbackId: context.ishitaNotice.id,
        author: expect.objectContaining({ name: 'Mo Mentor' }),
        colorCode: 'red',
      }),
      expect.objectContaining({
        feedbackId: context.zoyaNotice.id,
        submittedAt: at(16).toISOString(),
      }),
    ]);
  });

  it('is for anyone who can see the batch', async () => {
    const { admin, mentor, outsider, overview, other } = await setUp();

    const statuses = await Promise.all(
      [admin, mentor, outsider, { cookie: '' }].map(async (who) => (await overview(who)).status),
    );

    expect(statuses).toEqual([200, 200, 404, 401]);
    const theirs = BatchOverview.parse(await (await overview(outsider, other.id)).json());
    expect(theirs).toMatchObject({ current: 1, onNotice: [], toDeliver: [expect.anything()] });
  });
});
