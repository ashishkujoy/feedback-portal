import { z } from 'zod';
import { Role } from './role.ts';

/** `GET /me`: the signed-in user. Roles come in the order of `roles`. */
export const MeResponse = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  avatarUrl: z.url().nullable(),
  roles: z.array(Role).min(1),
});
export type MeResponse = z.infer<typeof MeResponse>;
