import { z } from 'zod';
import { newId } from '../../../shared/ids.ts';

/** One assignment (a `batch_members` row), not the person: someone re-assigned gets a new one. */
export const BatchMemberId = z.uuid().brand<'BatchMemberId'>();
export type BatchMemberId = z.infer<typeof BatchMemberId>;

export const newBatchMemberId = (): BatchMemberId => BatchMemberId.parse(newId());
