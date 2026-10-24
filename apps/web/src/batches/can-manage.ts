import type { BatchSummary, MeResponse } from '@feedback-portal/contracts';
import { isAdmin } from '../identity/roles.ts';

/**
 * Whether `me` manages this batch (its mentors and interns): an admin or its current PM, and only
 * while it isn't archived. The API enforces the same; this only decides what to show.
 */
export const canManageBatch = (
  me: MeResponse,
  batch: Pick<BatchSummary, 'isArchived' | 'programManager'>,
): boolean => !batch.isArchived && (isAdmin(me) || batch.programManager.id === me.id);
