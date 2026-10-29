import {
  BatchDetail,
  FeedbackView,
  InternSummary,
  MyPending,
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
  method: 'GET' | 'POST' | 'DELETE',
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

const at = (day: number, hour = 9) =>
  new Date(`2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`);

/**
 * On 16–20 October 2026 (UTC; sessions last a week): Mo mentors Batch A (Pat's) and Batch B
 * (Olu's); Meg mentors Batch A too. Mo was also a mentor of an archived batch, of one that starts
 * in November, and of one they've since left, each with an intern of its own.
 *
 * In Batch A, Mo gave Ana October's feedback, Meg gave Bo October's, Mo has a
 * draft for Cy, Mo gave Ed September's, and Di has withdrawn. In Batch B, Olu gave Fay October's.
 */
const setUp = async () => {
  const setup = realApp(db());
  setup.setTime(at(16));
  const person = (name: string, roles: [Role, ...Role[]]) => setup.signedInUser({ name, roles });
  const admin = await person('Ada Admin', ['admin']);
  const pat = await person('Pat Manager', ['program_manager']);
  const olu = await person('Olu Manager', ['program_manager']);
  const mo = await person('Mo Mentor', ['mentor']);
  const meg = await person('Meg Mentor', ['mentor']);
  const batchOf = async (name: string, pmId: string, startDate = '2026-07-06') =>
    BatchDetail.parse(
      await (
        await send(setup, 'POST', admin, '/batches', {
          name,
          startDate,
          endDate: '2027-12-18',
          programManagerId: pmId,
        })
      ).json(),
    );
  const a = await batchOf('Batch A', pat.user.id);
  const b = await batchOf('Batch B', olu.user.id);
  const archived = await batchOf('Batch C', pat.user.id);
  const upcoming = await batchOf('Batch D', pat.user.id, '2026-11-02');
  const left = await batchOf('Batch E', pat.user.id);
  const assign = async (batchId: string, who: typeof mo) =>
    expect(
      (await send(setup, 'POST', admin, `/batches/${batchId}/mentors`, { userId: who.user.id }))
        .status,
    ).toBe(200);
  await Promise.all([
    ...[a, b, archived, upcoming, left].map(async (batch) => assign(batch.id, mo)),
    assign(a.id, meg),
  ]);
  const internOf = async (batchId: string, name: string, who: Who = pat) => {
    const username = name.toLowerCase();
    return InternSummary.parse(
      await (
        await send(setup, 'POST', who, `/batches/${batchId}/interns`, {
          username,
          name,
          email: `${username}@example.com`,
        })
      ).json(),
    );
  };
  // Created out of order: the list sorts them.
  const ed = await internOf(a.id, 'Ed');
  const bo = await internOf(a.id, 'Bo');
  const ana = await internOf(a.id, 'Ana');
  const cy = await internOf(a.id, 'Cy');
  const di = await internOf(a.id, 'Di');
  const fay = await internOf(b.id, 'Fay', olu);
  const cleo = await internOf(archived.id, 'Cleo');
  await internOf(upcoming.id, 'Dot');
  await internOf(left.id, 'Eve');

  const write = async (
    who: Who,
    batchId: string,
    internId: string,
    options: Readonly<{ submit?: boolean; period?: string; colorCode?: string }> = {},
  ) => {
    const response = await send(
      setup,
      'POST',
      who,
      `/batches/${batchId}/interns/${internId}/feedback`,
      {
        period: options.period ?? '2026-10-01',
        body: 'Closed `PAY-214` with tests first.',
        colorCode: options.colorCode ?? 'green',
        givesNotice: false,
        submit: options.submit ?? true,
      },
    );
    expect(response.status).toBe(201);
    return FeedbackView.parse(await response.json());
  };

  const forEd = await write(mo, a.id, ed.id, { period: '2026-09-01', colorCode: 'yellow' });
  const draftForCleo = await write(mo, archived.id, cleo.id, { submit: false });
  expect((await send(setup, 'POST', admin, `/batches/${archived.id}/archive`)).status).toBe(200);
  expect(
    (await send(setup, 'DELETE', admin, `/batches/${left.id}/mentors/${mo.user.id}`)).status,
  ).toBe(200);
  expect(
    (
      await send(setup, 'POST', pat, `/batches/${a.id}/interns/${di.id}/status-changes`, {
        action: 'withdraw',
        reason: 'Recorded for the pending test.',
      })
    ).status,
  ).toBe(200);
  setup.setTime(at(17));
  const forAna = await write(mo, a.id, ana.id);
  setup.setTime(at(18));
  const forBo = await write(meg, a.id, bo.id, { colorCode: 'orange' });
  setup.setTime(at(19));
  const forFay = await write(olu, b.id, fay.id);
  const megsDraft = await write(meg, a.id, ed.id, { submit: false });
  setup.setTime(at(20));
  const draftForCy = await write(mo, a.id, cy.id, { submit: false, colorCode: 'yellow' });
  const pending = async (who: Who) => {
    const response = await send(setup, 'GET', who, '/me/pending');
    expect(response.status).toBe(200);
    return MyPending.parse(await response.json());
  };
  return {
    setup,
    admin,
    pat,
    olu,
    mo,
    meg,
    a,
    b,
    interns: { ana, bo, cy, di, ed, fay },
    feedback: { forEd, forAna, forBo, forFay, draftForCy, draftForCleo, megsDraft },
    pending,
  };
};

const names = (rows: readonly Readonly<{ intern: Readonly<{ name: string }> }>[]) =>
  rows.map((row) => row.intern.name);

describe('GET /me/pending', () => {
  it("lists a mentor's interns without their feedback this month, with the latest from anyone", async () => {
    const { mo, meg, olu, a, b, interns, pending } = await setUp();
    const body = await pending(mo);
    expect(body.month).toBe('2026-10-01');
    // Ana has Mo's October feedback; Di has withdrawn; Cleo, Dot and Eve are in batches that are
    // archived, not started yet, or that Mo left. Batch A first, then by name.
    expect(names(body.needsFeedback)).toEqual(['Bo', 'Cy', 'Ed', 'Fay']);
    const [bo, cy, ed, fay] = body.needsFeedback;
    // Meg's October feedback and Mo's own draft don't clear Bo and Cy for Mo (decision 1).
    expect(bo).toEqual({
      intern: { id: interns.bo.id, name: 'Bo', photoUrl: null },
      batch: { id: a.id, name: 'Batch A' },
      colorCode: 'orange',
      lastFeedback: {
        submittedAt: '2026-10-18T09:00:00.000Z',
        author: { id: meg.user.id, name: 'Meg Mentor', avatarUrl: null },
      },
    });
    expect(cy?.lastFeedback).toBeNull();
    // September's feedback is the latest, but not this month's.
    expect(ed?.lastFeedback?.author.id).toBe(mo.user.id);
    expect(fay).toMatchObject({
      batch: { id: b.id, name: 'Batch B' },
      lastFeedback: { author: { id: olu.user.id } },
    });
  });

  it('clears an intern once their feedback this month is delivered too', async () => {
    const { setup, mo, pat, a, interns, feedback, pending } = await setUp();
    expect(
      (
        await send(setup, 'POST', pat, `/batches/${a.id}/interns/${interns.ana.id}/conversations`, {
          feedbackId: feedback.forAna.id,
          heldOn: '2026-10-20',
          notes: 'Delivered in the weekly 1:1.',
        })
      ).status,
    ).toBe(201);
    expect(names((await pending(mo)).needsFeedback)).not.toContain('Ana');
    expect((await pending(pat)).toDeliver.map((row) => row.feedbackId)).not.toContain(
      feedback.forAna.id,
    );
  });

  it("lists only the user's own drafts, in their current batches", async () => {
    const { mo, meg, a, feedback, pending } = await setUp();
    const mine = await pending(mo);
    // Not Meg's draft for Ed, nor Mo's in the archived batch.
    expect(mine.drafts).toEqual([
      {
        feedbackId: feedback.draftForCy.id,
        intern: expect.objectContaining({ name: 'Cy' }),
        batch: { id: a.id, name: 'Batch A' },
        period: '2026-10-01',
        body: 'Closed `PAY-214` with tests first.',
        colorCode: 'yellow',
        updatedAt: '2026-10-20T09:00:00.000Z',
      },
    ]);
    expect((await pending(meg)).drafts.map((row) => row.feedbackId)).toEqual([
      feedback.megsDraft.id,
    ]);
  });

  it('lists undelivered feedback only in the batches the user is the PM of, newest first', async () => {
    const { mo, pat, olu, meg, feedback, pending } = await setUp();
    const pats = await pending(pat);
    expect(pats.toDeliver.map((row) => row.feedbackId)).toEqual([
      feedback.forBo.id,
      feedback.forAna.id,
      feedback.forEd.id,
    ]);
    expect(pats.toDeliver[0]).toMatchObject({
      batch: { name: 'Batch A' },
      author: { id: meg.user.id, name: 'Meg Mentor' },
      submittedAt: '2026-10-18T09:00:00.000Z',
      colorCode: 'orange',
    });
    // Pat runs A and E (which Mo left); C is archived and D hasn't started.
    expect(names(pats.needsFeedback)).toEqual(['Ana', 'Bo', 'Cy', 'Ed', 'Eve']);
    expect((await pending(olu)).toDeliver.map((row) => row.feedbackId)).toEqual([
      feedback.forFay.id,
    ]);
    // Mo mentors Batch A: its feedback isn't theirs to deliver.
    expect((await pending(mo)).toDeliver).toEqual([]);
  });

  it('is empty for an admin assigned nowhere, never cached, and needs a session', async () => {
    const { setup, admin, pending } = await setUp();
    expect(await pending(admin)).toEqual({
      month: '2026-10-01',
      needsFeedback: [],
      drafts: [],
      toDeliver: [],
    });
    const response = await send(setup, 'GET', admin, '/me/pending');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await send(setup, 'GET', { cookie: '' }, '/me/pending')).status).toBe(401);
  });

  it('takes the month from the UTC date', async () => {
    const { setup, mo, pending } = await setUp();
    // 1 Nov in UTC, though 31 Oct in New York; a fresh session, as the first has expired.
    setup.setTime(new Date('2026-10-31T23:30:00-05:00'));
    const { token } = await setup.sessions.create(mo.user.id, { userAgent: null, ip: null });
    const body = await pending({ cookie: `session=${token}` });
    expect(body.month).toBe('2026-11-01');
    // Nobody has November feedback from Mo yet.
    expect(names(body.needsFeedback)).toEqual(['Ana', 'Bo', 'Cy', 'Ed', 'Fay']);
  });
});
