import type { QueryClient } from '@tanstack/react-query';
import { apiSend } from '../api/api-fetch.ts';
import { meQuery } from '../api/me.ts';

type Navigate = (options: Readonly<{ to: '/login' }>) => Promise<void>;

/**
 * Ends the session, forgets everything cached for this user, and goes to sign-in. If the API
 * can't be reached the browser is signed out anyway; the server session then simply expires.
 */
export const signOut = async (queryClient: QueryClient, navigate: Navigate): Promise<void> => {
  try {
    await apiSend('/auth/logout', { method: 'POST' });
  } catch {
    // Nothing to tell the user: they asked to leave, and they will.
  }
  queryClient.clear();
  queryClient.setQueryData(meQuery.queryKey, null);
  await navigate({ to: '/login' });
};
