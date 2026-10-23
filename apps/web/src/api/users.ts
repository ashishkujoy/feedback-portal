import { AdminUser } from '@feedback-portal/contracts';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from './api-fetch.ts';

/** Every user, inactive ones included, sorted by name (admins only). */
export const usersQuery = queryOptions({
  queryKey: ['users'],
  queryFn: ({ signal }) => apiFetch('/users', { schema: z.array(AdminUser), signal }),
});
