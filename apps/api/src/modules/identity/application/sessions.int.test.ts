import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import { createSessionRepository } from '../infrastructure/drizzle-session-repository.ts';
import { createUserRepository } from '../infrastructure/drizzle-user-repository.ts';
import { sessions as sessionsTable } from '../infrastructure/schema.ts';
import { createUser } from '../domain/user.ts';
import { newUserId, type UserId } from '../domain/user-id.ts';
import { hashToken } from './session-token.ts';
import { createSessions } from './sessions.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;

const day = 24 * 60 * 60 * 1000;
const t0 = new Date('2026-01-01T00:00:00.000Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

/** A service whose clock the test moves. */
const serviceAt = () => {
  let current = t0;
  const service = createSessions({
    sessions: createSessionRepository(db()),
    now: () => current,
  });
  return {
    service,
    travelTo: (date: Date) => {
      current = date;
    },
  };
};

const savedUserId = async (email = `${newUserId()}@example.com`): Promise<UserId> => {
  const user = createUser({
    id: newUserId(),
    email,
    name: 'Someone',
    roles: ['mentor'],
    grantedBy: null,
    now: t0,
  });
  await createUserRepository(db()).save(user);
  return user.id;
};

const metadata = { userAgent: 'test-agent', ip: '203.0.113.7' };
const rows = () => db().select().from(sessionsTable);

describe('sessions', () => {
  it('stores only the hash of the token, with metadata and a 7-day expiry', async () => {
    const { service } = serviceAt();
    const userId = await savedUserId();
    const { token, session } = await service.create(userId, metadata);

    expect(await rows()).toEqual([
      {
        id: hashToken(token),
        userId,
        expiresAt: at(7 * day),
        createdAt: t0,
        userAgent: 'test-agent',
        ip: '203.0.113.7',
      },
    ]);
    expect(session.id).toBe(hashToken(token));
    const raw = await db().execute(sql`select * from sessions`);
    expect(JSON.stringify(raw.rows)).not.toContain(token);
  });

  it('truncates a long user agent', async () => {
    const { service } = serviceAt();
    const { session } = await service.create(await savedUserId(), {
      userAgent: 'x'.repeat(2000),
      ip: null,
    });

    expect(session.userAgent).toHaveLength(512);
  });

  it('validates the right token and rejects wrong, malformed or unknown ones', async () => {
    const { service } = serviceAt();
    const userId = await savedUserId();
    const { token } = await service.create(userId, metadata);

    expect(await service.validate(token)).toMatchObject({ session: { userId }, renewed: false });
    expect(await service.validate(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`)).toBe(
      null,
    );
    expect(await service.validate('not-a-token')).toBeNull();
    expect(await service.validate('')).toBeNull();
  });

  it('renews only after the halfway point', async () => {
    const { service, travelTo } = serviceAt();
    const { token } = await service.create(await savedUserId(), metadata);

    travelTo(at(3 * day));
    expect(await service.validate(token)).toMatchObject({
      renewed: false,
      session: { expiresAt: at(7 * day) },
    });

    travelTo(at(4 * day));
    expect(await service.validate(token)).toMatchObject({
      renewed: true,
      session: { expiresAt: at(11 * day) },
    });
    expect((await rows())[0]?.expiresAt).toEqual(at(11 * day));
  });

  it('enforces the 30-day cap through repeated use', async () => {
    const { service, travelTo } = serviceAt();
    const { token } = await service.create(await savedUserId(), metadata);

    // Each use depends on the previous renewal, so they run one after another.
    const useOn = async ([first, ...rest]: readonly number[]): Promise<boolean[]> => {
      if (first === undefined) return [];
      travelTo(at(first * day));
      const valid = (await service.validate(token)) !== null;
      return [valid, ...(await useOn(rest))];
    };

    expect(await useOn([4, 8, 12, 16, 20, 24, 28])).toEqual(Array.from({ length: 7 }, () => true));
    expect((await rows())[0]?.expiresAt).toEqual(at(30 * day));

    travelTo(at(30 * day));
    expect(await service.validate(token)).toBeNull();
  });

  it('deletes an expired session when it is presented', async () => {
    const { service, travelTo } = serviceAt();
    const { token } = await service.create(await savedUserId(), metadata);

    travelTo(at(7 * day));
    expect(await service.validate(token)).toBeNull();
    expect(await rows()).toEqual([]);
  });

  it('revokes one session (logout)', async () => {
    const { service } = serviceAt();
    const userId = await savedUserId();
    const first = await service.create(userId, metadata);
    const second = await service.create(userId, metadata);

    await service.revoke(first.token);
    await service.revoke('not-a-token');

    expect(await service.validate(first.token)).toBeNull();
    expect(await service.validate(second.token)).not.toBeNull();
  });

  it("revokes all of one user's sessions, and only theirs", async () => {
    const { service } = serviceAt();
    const userId = await savedUserId();
    const otherId = await savedUserId();
    const mine = [await service.create(userId, metadata), await service.create(userId, metadata)];
    const theirs = await service.create(otherId, metadata);

    await service.revokeAllForUser(userId);

    expect(await service.validate(mine[0]?.token ?? '')).toBeNull();
    expect(await service.validate(mine[1]?.token ?? '')).toBeNull();
    expect(await service.validate(theirs.token)).not.toBeNull();
  });

  it('removes expired sessions when a new one is created', async () => {
    const { service, travelTo } = serviceAt();
    const userId = await savedUserId();
    const old = await service.create(userId, metadata);
    travelTo(at(2 * day));
    const recent = await service.create(userId, metadata);

    travelTo(at(8 * day));
    const fresh = await service.create(await savedUserId(), metadata);

    expect((await rows()).map((row) => row.id).toSorted()).toEqual(
      [recent.session.id, fresh.session.id].toSorted(),
    );
    expect(old.session.id).not.toBe(recent.session.id);
  });
});
