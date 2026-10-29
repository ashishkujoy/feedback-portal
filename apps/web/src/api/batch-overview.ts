import { BatchOverview } from '@feedback-portal/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from './api-fetch.ts';

/** v2 A24's overview of a batch (11.1). */
export const batchOverviewQuery = (batchId: string) =>
  queryOptions({
    queryKey: ['batches', batchId, 'overview'],
    queryFn: ({ signal }) =>
      apiFetch(`/batches/${batchId}/overview`, { schema: BatchOverview, signal }),
  });
