import {
  BatchDetail,
  BatchSummary,
  InternDetail,
  InternSummary,
  PhotoUploadTicket,
  ProblemDetails,
  type Role,
} from '@feedback-portal/contracts';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { realApp } from '../../../../test/app-deps.ts';
import { useTestDb } from '../../../../test/test-db.ts';
import { newBatchId } from '../../cohort/domain/batch-id.ts';
import { giveNotice } from '../domain/intern.ts';
import { InternId, newInternId } from '../domain/intern-id.ts';
import { newStatusEventId } from '../domain/status-event-id.ts';
import {
  createCloudinaryPhotoStorage,
  signParams,
} from '../infrastructure/cloudinary-photo-storage.ts';
import { createInternRepository } from '../infrastructure/drizzle-intern-repository.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;

type Setup = ReturnType<typeof realApp>;

const get = ({ app }: Setup, cookie: string, path: string) =>
  app.request(path, { headers: { cookie } });

const post = ({ app, webAppUrl }: Setup, cookie: string, path: string, body?: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: {
      cookie,
      origin: webAppUrl,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const problemOf = async (response: Response, status: number) => {
  expect(response.status).toBe(status);
  return ProblemDetails.parse(await response.json());
};

const ishita = { username: 'ishita.rao', name: 'Ishita Rao', email: 'ishita@example.com' };

/** The full app with a signed-in admin, the batch's PM and its mentor, and the batch. */
const setUp = async () => {
  const setup = realApp(db());
  const person = (name: string, roles: [Role, ...Role[]]) => setup.signedInUser({ name, roles });
  const admin = await person('Ada Admin', ['admin']);
  const pm = await person('Pat Manager', ['program_manager']);
  // A PM elsewhere who mentors here: they pass the role check, but don't run this batch.
  const mentor = await person('Mo Mentor', ['program_manager', 'mentor']);
  const created = await post(setup, admin.cookie, '/batches', {
    name: 'Batch 1',
    startDate: '2027-01-11',
    endDate: '2028-06-25',
    programManagerId: pm.user.id,
  });
  const batch = BatchDetail.parse(await created.json());
  await post(setup, admin.cookie, `/batches/${batch.id}/mentors`, { userId: mentor.user.id });
  const add = (who: { cookie: string }, body: unknown = ishita, batchId = batch.id) =>
    post(setup, who.cookie, `/batches/${batchId}/interns`, body);
  const list = (who: { cookie: string }, batchId = batch.id) =>
    get(setup, who.cookie, `/batches/${batchId}/interns`);
  return { setup, person, admin, pm, mentor, batch, add, list };
};

describe('POST /batches/:batchId/interns', () => {
  it('adds an active intern, normalised, with its onboarding event', async () => {
    const { pm, batch, add } = await setUp();

    const response = await add(pm, {
      username: ' @Ishita.Rao ',
      name: ' Ishita Rao ',
      email: 'Ishita@Example.COM',
      phone: '',
      diplomaBranch: 'Mechanical',
      interviewNotes: '**Strong** in maths',
    });

    expect(response.status).toBe(201);
    const intern = InternSummary.parse(await response.json());
    expect(intern).toEqual({
      id: expect.any(String),
      batchId: batch.id,
      username: 'ishita.rao',
      name: 'Ishita Rao',
      email: 'ishita@example.com',
      status: 'active',
      colorCode: null,
      noticeEndsOn: null,
      photoUrl: null,
    });
    expect(response.headers.get('location')).toBe(`/batches/${batch.id}/interns/${intern.id}`);
    const saved = await createInternRepository(db()).findById(InternId.parse(intern.id));
    expect(saved).toMatchObject({
      phone: null,
      diplomaBranch: 'Mechanical',
      parentNames: null,
      interviewNotes: '**Strong** in maths',
    });
    expect(saved?.statusEvents).toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: 'active', actorId: pm.user.id }),
    ]);
  });

  it('reports every invalid field', async () => {
    const { pm, add } = await setUp();

    const problem = await problemOf(
      await add(pm, { username: 'ishita rao', name: ' ', email: 'nope', phone: 'x'.repeat(51) }),
      400,
    );

    expect(problem.code).toBe('validation_failed');
    expect(problem.errors?.map((issue) => issue.path)).toEqual([
      'username',
      'name',
      'email',
      'phone',
    ]);
  });

  it('rejects a username already in the batch, in any case', async () => {
    const { pm, add } = await setUp();
    await add(pm);

    const problem = await problemOf(await add(pm, { ...ishita, username: 'ISHITA.rao' }), 409);

    expect(problem.code).toBe('intern_username_taken');
  });

  describe('access', () => {
    it('is 401 when signed out', async () => {
      const { setup, batch } = await setUp();

      expect(
        (await problemOf(await post(setup, '', `/batches/${batch.id}/interns`, ishita), 401)).code,
      ).toBe('unauthenticated');
    });

    it("is 403 for one of the batch's mentors", async () => {
      const { mentor, person, admin, setup, batch, add } = await setUp();
      const mentorOnly = await person('Mia Mentor', ['mentor']);
      await post(setup, admin.cookie, `/batches/${batch.id}/mentors`, {
        userId: mentorOnly.user.id,
      });

      expect((await problemOf(await add(mentor), 403)).code).toBe('forbidden');
      expect((await problemOf(await add(mentorOnly), 403)).code).toBe('forbidden');
    });

    it("is 404 for a PM who isn't on the batch", async () => {
      const { person, add } = await setUp();
      const otherPm = await person('Oli Other', ['program_manager']);

      expect((await problemOf(await add(otherPm), 404)).code).toBe('not_found');
    });

    it("is open to the batch's PM and to admins", async () => {
      const { pm, admin, add } = await setUp();

      expect((await add(pm)).status).toBe(201);
      expect((await add(admin, { ...ishita, username: 'kabir.s' })).status).toBe(201);
    });

    it('is 409 on an archived batch', async () => {
      const { setup, admin, batch, add } = await setUp();
      await post(setup, admin.cookie, `/batches/${batch.id}/archive`);

      expect((await problemOf(await add(admin), 409)).code).toBe('batch_archived');
    });

    it('is 404 for a batch that does not exist', async () => {
      const { admin, add } = await setUp();

      expect((await problemOf(await add(admin, ishita, newBatchId()), 404)).code).toBe('not_found');
    });
  });
});

const namesOf = async (response: Response) => {
  expect(response.status).toBe(200);
  return z
    .array(InternSummary)
    .parse(await response.json())
    .map((intern) => intern.name);
};

describe('GET /batches/:batchId/interns', () => {
  it("lists the batch's interns by name, ignoring case", async () => {
    const { pm, add, list } = await setUp();
    await Promise.all(
      [
        ['zoya', 'Zoya Ansari'],
        ['aarav', 'aarav Sharma'],
        ['ishita', 'Ishita Rao'],
      ].map(async ([username = '', name]) =>
        add(pm, { username, name, email: `${username}@example.com` }),
      ),
    );

    expect(await namesOf(await list(pm))).toEqual(['aarav Sharma', 'Ishita Rao', 'Zoya Ansari']);
  });

  it('lists only that batch', async () => {
    const { setup, admin, pm, add, list } = await setUp();
    const other = BatchDetail.parse(
      await (
        await post(setup, admin.cookie, '/batches', {
          name: 'Batch 2',
          startDate: '2027-01-11',
          endDate: '2028-06-25',
          programManagerId: pm.user.id,
        })
      ).json(),
    );
    await add(pm);
    await add(pm, { ...ishita, username: 'kabir', name: 'Kabir Nair' }, other.id);

    expect(await namesOf(await list(pm))).toEqual(['Ishita Rao']);
  });

  it("is open to the batch's PM, its mentors and admins", async () => {
    const { pm, mentor, admin, add, list } = await setUp();
    await add(pm);

    const lists = await Promise.all(
      [pm, mentor, admin].map(async (who) => namesOf(await list(who))),
    );

    expect(lists).toEqual([['Ishita Rao'], ['Ishita Rao'], ['Ishita Rao']]);
  });

  it('is still readable once the batch is archived', async () => {
    const { setup, admin, pm, batch, add, list } = await setUp();
    await add(pm);
    await post(setup, admin.cookie, `/batches/${batch.id}/archive`);

    expect(await namesOf(await list(pm))).toEqual(['Ishita Rao']);
  });

  it("is 404 for someone who isn't on the batch, and for an unknown batch", async () => {
    const { person, admin, list } = await setUp();
    const outsider = await person('Oli Other', ['mentor']);

    expect((await problemOf(await list(outsider), 404)).code).toBe('not_found');
    expect((await problemOf(await list(admin, newBatchId()), 404)).code).toBe('not_found');
  });

  it('is 401 when signed out', async () => {
    const { setup, batch } = await setUp();

    expect((await problemOf(await get(setup, '', `/batches/${batch.id}/interns`), 401)).code).toBe(
      'unauthenticated',
    );
  });
});

describe('the batch counts', () => {
  it('include the interns once they are added', async () => {
    const { setup, admin, pm, batch, add } = await setUp();
    // A second, later batch without interns: listed first (newest start), with zeros.
    await post(setup, admin.cookie, '/batches', {
      name: 'Batch 2',
      startDate: '2027-07-12',
      endDate: '2028-12-22',
      programManagerId: pm.user.id,
    });
    await add(pm);
    await add(pm, { ...ishita, username: 'kabir', name: 'Kabir Nair' });

    const detail = BatchDetail.parse(
      await (await get(setup, pm.cookie, `/batches/${batch.id}`)).json(),
    );
    const summaries = z
      .array(BatchSummary)
      .parse(await (await get(setup, pm.cookie, '/batches')).json());

    const expected = {
      total: 2,
      onNotice: 0,
      terminated: 0,
      colours: {
        green: 0,
        yellow: 0,
        borderline_yellow: 0,
        orange: 0,
        borderline_red: 0,
        red: 0,
        none: 2,
      },
    };
    expect(detail.interns).toEqual(expected);
    expect(summaries.map((summary) => [summary.name, summary.interns.total])).toEqual([
      ['Batch 2', 0],
      ['Batch 1', 2],
    ]);
    expect(summaries[1]?.interns).toEqual(expected);
  });
});

const addedOf = async (response: Response) => InternSummary.parse(await response.json());

describe('GET /batches/:batchId/interns/:internId', () => {
  it('shows the profile: details, how they arrived, and the history newest first', async () => {
    const { setup, pm, batch, add } = await setUp();
    const { id } = await addedOf(
      await add(pm, {
        ...ishita,
        phone: '+91 98450 12345',
        diplomaBranch: 'Computer Engineering',
        interviewNotes: '### Technical round',
      }),
    );
    // A later change, made with the domain as 7.6 will (there's no endpoint for it yet).
    const repo = createInternRepository(db());
    const saved = await repo.findById(InternId.parse(id));
    if (!saved) throw new Error('expected the intern');
    await repo.save(
      giveNotice(saved, {
        eventId: newStatusEventId(),
        reason: 'Missed every deadline',
        actor: pm.user.id,
        now: new Date(Date.now() + 60_000),
        startsOn: '2027-04-01',
        feedbackId: null,
      }),
    );

    const response = await get(setup, pm.cookie, `/batches/${batch.id}/interns/${id}`);

    expect(response.status).toBe(200);
    const detail = InternDetail.parse(await response.json());
    expect(detail).toMatchObject({
      id,
      batchId: batch.id,
      username: 'ishita.rao',
      status: 'on_notice',
      noticeEndsOn: '2027-05-01',
      phone: '+91 98450 12345',
      diplomaBranch: 'Computer Engineering',
      parentNames: null,
      interviewNotes: '### Technical round',
      source: 'manual',
      addedBy: { id: pm.user.id, name: 'Pat Manager' },
    });
    expect(
      detail.statusEvents.map((event) => [
        event.fromStatus,
        event.toStatus,
        event.reason,
        event.noticeEndsOn,
        event.actor.name,
      ]),
    ).toEqual([
      ['active', 'on_notice', 'Missed every deadline', '2027-05-01', 'Pat Manager'],
      [null, 'active', null, null, 'Pat Manager'],
    ]);
  });

  it("is open to the batch's PM, its mentors and admins", async () => {
    const { setup, pm, mentor, admin, batch, add } = await setUp();
    const { id } = await addedOf(await add(pm));

    const statuses = await Promise.all(
      [pm, mentor, admin].map(
        async (who) => (await get(setup, who.cookie, `/batches/${batch.id}/interns/${id}`)).status,
      ),
    );

    expect(statuses).toEqual([200, 200, 200]);
  });

  it("is 404 for someone who isn't on the batch, an unknown intern, or another batch's intern", async () => {
    const { setup, person, admin, pm, batch, add } = await setUp();
    const { id } = await addedOf(await add(pm));
    const outsider = await person('Oli Other', ['mentor']);
    const other = BatchDetail.parse(
      await (
        await post(setup, admin.cookie, '/batches', {
          name: 'Batch 2',
          startDate: '2027-01-11',
          endDate: '2028-06-25',
          programManagerId: pm.user.id,
        })
      ).json(),
    );

    const codes = await Promise.all(
      (
        [
          [outsider, `/batches/${batch.id}/interns/${id}`],
          [admin, `/batches/${batch.id}/interns/${newInternId()}`],
          [admin, `/batches/${other.id}/interns/${id}`],
        ] as const
      ).map(async ([who, path]) => (await problemOf(await get(setup, who.cookie, path), 404)).code),
    );

    expect(codes).toEqual(['not_found', 'not_found', 'not_found']);
  });

  it('is 401 when signed out', async () => {
    const { setup, pm, batch, add } = await setUp();
    const { id } = await addedOf(await add(pm));

    expect(
      (await problemOf(await get(setup, '', `/batches/${batch.id}/interns/${id}`), 401)).code,
    ).toBe('unauthenticated');
  });
});

/** An intern of the set-up batch, saved by the PM; on notice if asked. */
const internOf = async (
  { pm, add }: Awaited<ReturnType<typeof setUp>>,
  { onNotice = false, username = 'ishita.rao' } = {},
) => {
  const { id } = await addedOf(await add(pm, { ...ishita, username }));
  if (onNotice) {
    const repo = createInternRepository(db());
    const saved = await repo.findById(InternId.parse(id));
    if (!saved) throw new Error('expected the intern');
    await repo.save(
      giveNotice(saved, {
        eventId: newStatusEventId(),
        reason: 'Missed every deadline',
        actor: pm.user.id,
        now: new Date(Date.now() + 1000),
        startsOn: '2027-04-01',
        feedbackId: null,
      }),
    );
  }
  return id;
};

const change = (
  { setup, batch }: Awaited<ReturnType<typeof setUp>>,
  who: { cookie: string },
  internId: string,
  body: unknown,
  batchId = batch.id,
) => post(setup, who.cookie, `/batches/${batchId}/interns/${internId}/status-changes`, body);

describe('POST /batches/:batchId/interns/:internId/status-changes', () => {
  it.each([
    ['graduate', false, 'active', 'graduated'],
    ['withdraw', false, 'active', 'withdrawn'],
    ['withdraw', true, 'on_notice', 'withdrawn'],
    ['lift_notice', true, 'on_notice', 'active'],
    ['terminate', true, 'on_notice', 'terminated'],
  ] as const)(
    '%s from %s: records the change with its reason',
    async (action, onNotice, from, to) => {
      const setupResult = await setUp();
      const id = await internOf(setupResult, { onNotice });
      // A later time than the notice, so the new event is the newest.
      setupResult.setup.travel(60_000);

      const response = await change(setupResult, setupResult.pm, id, {
        action,
        reason: '  Discussed in the **1:1**  ',
      });

      expect(response.status).toBe(200);
      const detail = InternDetail.parse(await response.json());
      expect(detail.status).toBe(to);
      expect(detail.noticeEndsOn).toBeNull();
      expect(detail.statusEvents[0]).toMatchObject({
        fromStatus: from,
        toStatus: to,
        reason: 'Discussed in the **1:1**',
        actor: { id: setupResult.pm.user.id, name: 'Pat Manager' },
      });
    },
  );

  it("refuses what the state machine doesn't allow, and any change once final", async () => {
    const setupResult = await setUp();
    const onNotice = await internOf(setupResult, { onNotice: true });
    const active = await internOf(setupResult, { username: 'kabir' });
    await change(setupResult, setupResult.pm, active, { action: 'graduate', reason: 'Done' });

    const problems = await Promise.all([
      change(setupResult, setupResult.pm, onNotice, { action: 'graduate', reason: 'Done' }),
      change(setupResult, setupResult.pm, active, { action: 'withdraw', reason: 'Left' }),
    ]).then((responses) => Promise.all(responses.map(async (r) => problemOf(r, 409))));

    expect(problems.map((problem) => problem.code)).toEqual([
      'invalid_status_transition',
      'intern_read_only',
    ]);
  });

  it('asks for a reason', async () => {
    const setupResult = await setUp();
    const id = await internOf(setupResult);

    const problem = await problemOf(
      await change(setupResult, setupResult.pm, id, { action: 'graduate', reason: ' \n ' }),
      400,
    );

    expect(problem.errors).toEqual([{ path: 'reason', message: 'Add a reason.' }]);
  });

  it("is only for the batch's programme manager", async () => {
    const setupResult = await setUp();
    const id = await internOf(setupResult);
    const otherPm = await setupResult.person('Oli Other', ['program_manager']);
    const body = { action: 'graduate', reason: 'Done' };

    const statuses = await Promise.all(
      [setupResult.admin, setupResult.mentor, otherPm].map(
        async (who) => (await change(setupResult, who, id, body)).status,
      ),
    );

    // An admin and a mentor (a PM elsewhere) can see the batch: 403. The other PM can't: 404.
    expect(statuses).toEqual([403, 403, 404]);
  });

  it("is 404 for another batch's intern, and 409 once the batch is archived", async () => {
    const setupResult = await setUp();
    const { setup, admin, pm, batch } = setupResult;
    const id = await internOf(setupResult);
    const other = BatchDetail.parse(
      await (
        await post(setup, admin.cookie, '/batches', {
          name: 'Batch 2',
          startDate: '2027-01-11',
          endDate: '2028-06-25',
          programManagerId: pm.user.id,
        })
      ).json(),
    );
    const body = { action: 'graduate', reason: 'Done' };

    expect((await problemOf(await change(setupResult, pm, id, body, other.id), 404)).code).toBe(
      'not_found',
    );
    await post(setup, admin.cookie, `/batches/${batch.id}/archive`);
    expect((await problemOf(await change(setupResult, pm, id, body), 409)).code).toBe(
      'batch_archived',
    );
  });

  it('is 401 when signed out', async () => {
    const setupResult = await setUp();
    const id = await internOf(setupResult);

    expect(
      (
        await problemOf(
          await change(setupResult, { cookie: '' }, id, { action: 'graduate', reason: 'x' }),
          401,
        )
      ).code,
    ).toBe('unauthenticated');
  });

  it('lets one of two changes at the same time through; the other sees it', async () => {
    const setupResult = await setUp();
    const id = await internOf(setupResult);

    const statuses = (
      await Promise.all([
        change(setupResult, setupResult.pm, id, { action: 'graduate', reason: 'Done' }),
        change(setupResult, setupResult.pm, id, { action: 'withdraw', reason: 'Left' }),
      ])
    ).map((response) => response.status);

    expect(statuses.toSorted((a, b) => a - b)).toEqual([200, 409]);
    const saved = await createInternRepository(db()).findById(InternId.parse(id));
    expect(saved?.statusEvents).toHaveLength(2);
  });
});

/** What Cloudinary would answer for an upload of `publicId`. */
const answer = (publicId: string, version = 1_799_658_001) => ({
  publicId,
  version,
  signature: signParams({ public_id: publicId, version }, 'test-secret'),
  bytes: 120_000,
});

describe('photos', () => {
  const photosConfig = {
    cloudName: 'demo',
    apiKey: 'key-1',
    apiSecret: 'test-secret',
    folder: 'portal/interns',
    apiBaseUrl: 'https://api.cloudinary.test',
    deliveryBaseUrl: 'https://res.cloudinary.test',
  };

  /** The app with photos on: the real Cloudinary signing, and deletions recorded. */
  const withPhotos = async () => {
    const removed: string[] = [];
    const fetchFn = vi.fn<typeof fetch>((_url, init) => {
      removed.push(init?.body instanceof URLSearchParams ? (init.body.get('public_id') ?? '') : '');
      return Promise.resolve(new Response('{"result":"ok"}', { status: 200 }));
    });
    const storage = createCloudinaryPhotoStorage(photosConfig, fetchFn);
    const setup = realApp(db(), { photos: storage });
    const person = (name: string, roles: [Role, ...Role[]]) => setup.signedInUser({ name, roles });
    const admin = await person('Ada Admin', ['admin']);
    const pm = await person('Pat Manager', ['program_manager']);
    const mentor = await person('Mo Mentor', ['mentor']);
    const batch = BatchDetail.parse(
      await (
        await post(setup, admin.cookie, '/batches', {
          name: 'Batch 1',
          startDate: '2027-01-11',
          endDate: '2028-06-25',
          programManagerId: pm.user.id,
        })
      ).json(),
    );
    await post(setup, admin.cookie, `/batches/${batch.id}/mentors`, { userId: mentor.user.id });
    const { id } = await addedOf(
      await post(setup, pm.cookie, `/batches/${batch.id}/interns`, ishita),
    );
    const base = `/batches/${batch.id}/interns/${id}`;
    const ticket = async (who: { cookie: string }) =>
      post(setup, who.cookie, `${base}/photo-upload`);
    const save = (who: { cookie: string }, body: unknown) =>
      setup.app.request(`${base}/photo`, {
        method: 'PUT',
        headers: {
          cookie: who.cookie,
          origin: setup.webAppUrl,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    return { setup, admin, pm, mentor, batch, id, base, ticket, save, removed };
  };

  it('issues a signed ticket for a new photo of this intern', async () => {
    const { pm, id, ticket } = await withPhotos();

    const response = await ticket(pm);

    expect(response.status).toBe(200);
    const body = PhotoUploadTicket.parse(await response.json());
    expect(body).toMatchObject({
      uploadUrl: 'https://api.cloudinary.test/v1_1/demo/image/upload',
      apiKey: 'key-1',
      allowedFormats: 'jpg,png',
    });
    expect(body.publicId.startsWith(`portal/interns/${id}/`)).toBe(true);
    expect(body.signature).toBe(
      signParams(
        { allowed_formats: 'jpg,png', public_id: body.publicId, timestamp: body.timestamp },
        'test-secret',
      ),
    );
  });

  it('saves a genuine upload, shows it everywhere, and deletes the photo it replaces', async () => {
    const { setup, pm, batch, id, ticket, save, removed } = await withPhotos();
    const first = PhotoUploadTicket.parse(await (await ticket(pm)).json()).publicId;
    await save(pm, answer(first));
    const second = PhotoUploadTicket.parse(await (await ticket(pm)).json()).publicId;

    const response = await save(pm, answer(second));

    expect(response.status).toBe(200);
    const url = `https://res.cloudinary.test/demo/image/upload/c_fill,g_face,w_128,h_128,f_auto,q_auto/${second}`;
    expect(InternDetail.parse(await response.json()).photoUrl).toBe(url);
    const roster = z
      .array(InternSummary)
      .parse(await (await get(setup, pm.cookie, `/batches/${batch.id}/interns`)).json());
    expect(roster.map((intern) => intern.photoUrl)).toEqual([url]);
    expect(removed).toEqual([first]);
    expect(id).toBeDefined();
  });

  it('refuses a forged answer, another intern’s photo, or one over 5 MB, and saves nothing', async () => {
    const { pm, id, ticket, save, removed } = await withPhotos();
    const publicId = PhotoUploadTicket.parse(await (await ticket(pm)).json()).publicId;
    const otherIntern = `portal/interns/${newInternId()}/x`;

    const problems = await Promise.all(
      [
        { ...answer(publicId), signature: 'forged' },
        answer(otherIntern),
        { ...answer(publicId), bytes: 5 * 1024 * 1024 + 1 },
      ].map(async (body) => (await problemOf(await save(pm, body), 400)).errors?.[0]?.path),
    );

    expect(problems).toEqual(['publicId', 'publicId', 'bytes']);
    const saved = await createInternRepository(db()).findById(InternId.parse(id));
    expect(saved?.photoPublicId).toBeNull();
    expect(removed).toEqual([]);
  });

  it('is for the batch’s managers only', async () => {
    const { setup, admin, pm, mentor, ticket } = await withPhotos();
    const outsider = await setup.signedInUser({ name: 'Oli Other', roles: ['program_manager'] });

    const statuses = await Promise.all(
      [admin, pm, mentor, outsider].map(async (who) => (await ticket(who)).status),
    );

    expect(statuses).toEqual([200, 200, 403, 404]);
  });

  it('is refused for a read-only intern and in an archived batch', async () => {
    const { setup, admin, pm, batch, base, ticket } = await withPhotos();
    await post(setup, pm.cookie, `${base}/status-changes`, { action: 'graduate', reason: 'Done' });
    expect((await problemOf(await ticket(pm), 409)).code).toBe('intern_read_only');

    await post(setup, admin.cookie, `/batches/${batch.id}/archive`);
    expect((await problemOf(await ticket(pm), 409)).code).toBe('batch_archived');
  });

  it('is unavailable when photos are off, and settings say so', async () => {
    const { pm, batch, add } = await setUp();
    const { id } = await addedOf(await add(pm));
    const setup = realApp(db());

    const response = await post(
      setup,
      pm.cookie,
      `/batches/${batch.id}/interns/${id}/photo-upload`,
    );

    expect((await problemOf(response, 503)).code).toBe('unavailable');
    expect(await (await setup.app.request('/settings')).json()).toMatchObject({ photos: false });
    expect(
      await (
        await realApp(db(), { photos: createCloudinaryPhotoStorage(photosConfig) }).app.request(
          '/settings',
        )
      ).json(),
    ).toMatchObject({ photos: true });
  });
});
