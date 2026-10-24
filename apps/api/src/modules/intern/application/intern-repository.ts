import type { Intern } from '../domain/intern.ts';
import type { InternId } from '../domain/intern-id.ts';

/** Persistence for the `Intern` aggregate, its status history included. Nothing is deleted. */
export type InternRepository = Readonly<{
  findById: (id: InternId) => Promise<Intern | null>;
  /** Creates or updates the intern and adds its new status events. Throws `intern_username_taken`. */
  save: (intern: Intern) => Promise<void>;
}>;
