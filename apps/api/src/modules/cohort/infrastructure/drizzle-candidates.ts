import type { DbExecutor } from '../../../shared/db/client.ts';
import { createUserRepository } from '../../identity/infrastructure/drizzle-user-repository.ts';
import type { Candidates } from '../application/candidates.ts';

/** Builds a `Candidate` from identity's user repository, on the same executor (transaction). */
export const createCandidates =
  (db: DbExecutor): Candidates =>
  async (id) => {
    const user = await createUserRepository(db).findById(id);
    if (!user) return null;
    return { id: user.id, roles: user.roles.map((grant) => grant.role), isActive: user.isActive };
  };
