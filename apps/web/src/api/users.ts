import { AdminUser, type CreateUserRequest, type Role } from '@feedback-portal/contracts';
import { type QueryClient, queryOptions } from '@tanstack/react-query';
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

/** `PUT /users/:id/roles`: the complete set the user should hold. */
export const setUserRoles = (id: string, roles: readonly Role[]) =>
  apiFetch(`/users/${id}/roles`, { method: 'PUT', body: { roles }, schema: AdminUser });

/** "Remove": they're signed out and can't sign in; their feedback stays attributable. */
export const deactivateUser = (id: string) =>
  apiFetch(`/users/${id}/deactivate`, { method: 'POST', schema: AdminUser });

export const reactivateUser = (id: string) =>
  apiFetch(`/users/${id}/reactivate`, { method: 'POST', schema: AdminUser });

/** Puts the API's answer for one user into the cached list, so the page updates without a refetch. */
export const replaceUser = (queryClient: QueryClient, user: AdminUser) => {
  queryClient.setQueryData(usersQuery.queryKey, (users) =>
    users?.map((current) => (current.id === user.id ? user : current)),
  );
};
