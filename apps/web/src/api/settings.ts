import { SettingsResponse } from '@feedback-portal/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from './api-fetch.ts';

/**
 * The program and organisation names; they only change when the API restarts. The first page
 * waits for them, so a failure isn't retried (that would hold the page back); the next
 * navigation tries again.
 */
export const settingsQuery = queryOptions({
  queryKey: ['settings'],
  queryFn: ({ signal }) => apiFetch('/settings', { schema: SettingsResponse, signal }),
  staleTime: Infinity,
  retry: false,
});
