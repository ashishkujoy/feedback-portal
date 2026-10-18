import { eq, lte } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import type { SessionRepository } from '../application/session-repository.ts';
import type { Session } from '../domain/session.ts';
import { UserId } from '../domain/user-id.ts';
import { sessions } from './schema.ts';

const toSession = (row: typeof sessions.$inferSelect): Session => ({
  id: row.id,
  userId: UserId.parse(row.userId),
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
  userAgent: row.userAgent,
  ip: row.ip,
});

export const createSessionRepository = (db: DbExecutor): SessionRepository => ({
  insert: async (session) => {
    await db.insert(sessions).values(session);
  },
  findById: async (id) => {
    const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
    return row ? toSession(row) : null;
  },
  updateExpiry: async (id, expiresAt) => {
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
  },
  delete: async (id) => {
    await db.delete(sessions).where(eq(sessions.id, id));
  },
  deleteForUser: async (userId) => {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  },
  deleteExpired: async (now) => {
    await db.delete(sessions).where(lte(sessions.expiresAt, now));
  },
});
