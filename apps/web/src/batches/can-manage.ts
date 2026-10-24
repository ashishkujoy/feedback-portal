import type { BatchSummary, MeResponse } from '@feedback-portal/contracts';
import { isAdmin } from '../identity/roles.ts';

/**
 * Whether `me` may change this batch's mentors: an admin or its current PM, and only while it
 * isn't archived. The API enforces the same; this only decides what to show.
 */
export const canManageMentors = (
  me: MeResponse,
  batch: Pick<BatchSummary, 'isArchived' | 'programManager'>,
): boolean => !batch.isArchived && (isAdmin(me) || batch.programManager.id === me.id);
