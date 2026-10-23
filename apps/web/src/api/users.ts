import { AdminUser, type CreateUserRequest } from '@feedback-portal/contracts';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from './api-fetch.ts';

/** Every user, inactive ones included, sorted by name (admins only). */
export const usersQuery = queryOptions({
  queryKey: ['users'],
  queryFn: ({ signal }) => apiFetch('/users', { schema: z.array(AdminUser), signal }),
});

/** `POST /users`: the new user, or an `ApiError` (`email_taken` when the email is in use). */
export const createUser = (body: CreateUserRequest) =>
  apiFetch('/users', { method: 'POST', body, schema: AdminUser });
