import type { UserId } from '../../identity/domain/user-id.ts';
import type { Candidate } from '../domain/candidate.ts';

/** Looks up a person to assign: `null` if there is no such user. */
export type Candidates = (id: UserId) => Promise<Candidate | null>;
