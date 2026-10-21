import { z } from 'zod';
import { Role } from './role.ts';

/** A user as the admin screens see them. Roles come in the order of `roles`; dates are ISO. */
export const AdminUser = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  avatarUrl: z.url().nullable(),
  isActive: z.boolean(),
  roles: z.array(Role).min(1),
  lastLoginAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminUser = z.infer<typeof AdminUser>;

const roleList = z.array(Role).min(1, { error: 'At least one role is required' });

/** `POST /users`. The same limits as the API's domain, so the web form can check them first. */
export const CreateUserRequest = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(
      z
        .email({ error: 'Invalid email address' })
        .max(254, { error: 'Email must be at most 254 characters' }),
    ),
  name: z
    .string()
    .trim()
    .min(1, { error: 'Name is required' })
    .max(200, { error: 'Name must be at most 200 characters' }),
  roles: roleList,
});
export type CreateUserRequest = z.input<typeof CreateUserRequest>;

/** `PUT /users/:id/roles`: the complete set the user should hold. */
export const SetRolesRequest = z.object({ roles: roleList });
export type SetRolesRequest = z.input<typeof SetRolesRequest>;
