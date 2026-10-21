import { CreateUserRequest, SetRolesRequest } from '@feedback-portal/contracts';
import { getLogger } from '@logtape/logtape';
import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../../../shared/http/validate.ts';
import { rootCategory } from '../../../shared/logging/logging.ts';
import {
  addUser,
  deactivateUser,
  listUsers,
  reactivateUser,
  setUserRoles,
} from '../application/manage-users.ts';
import type { UserAdminTransaction } from '../application/user-admin.ts';
import { UserId } from '../domain/user-id.ts';
import type { AuthEnv } from './auth-env.ts';
import { type AuthenticateDeps, authenticate } from './authenticate.ts';
import { requireRole } from './require-role.ts';
import { toAdminUser } from './user-views.ts';

export type UsersRoutesDeps = AuthenticateDeps & Readonly<{ userAdmin: UserAdminTransaction }>;

const UserParams = z.object({ id: UserId });

const logger = getLogger([rootCategory, 'users']);

/**
 * The admin's "Users and roles" API. Changes are idempotent: repeating one returns 200 and
 * writes nothing. Logs carry the actor's and the target's IDs, never the email.
 */
export const usersRoutes = (deps: UsersRoutesDeps) => {
  const manage = { users: deps.users, transaction: deps.userAdmin, now: deps.now };

  return new Hono<AuthEnv>()
    .use(authenticate(deps), requireRole('admin'))
    .get('/', async (c) => c.json((await listUsers(manage)).map(toAdminUser)))
    .post('/', validate('json', CreateUserRequest), async (c) => {
      const actor = c.var.currentUser.id;
      const user = await addUser(manage, { actor, ...c.req.valid('json') });
      logger.info('user created', {
        actorId: actor,
        userId: user.id,
        roles: toAdminUser(user).roles,
      });
      c.header('Location', `/users/${user.id}`);
      return c.json(toAdminUser(user), 201);
    })
    .put(
      '/:id/roles',
      validate('param', UserParams),
      validate('json', SetRolesRequest),
      async (c) => {
        const actor = c.var.currentUser.id;
        const { id } = c.req.valid('param');
        const user = toAdminUser(
          await setUserRoles(manage, { actor, userId: id, roles: c.req.valid('json').roles }),
        );
        logger.info('user roles set', { actorId: actor, userId: id, roles: user.roles });
        return c.json(user);
      },
    )
    .post('/:id/deactivate', validate('param', UserParams), async (c) => {
      const actor = c.var.currentUser.id;
      const { id } = c.req.valid('param');
      const user = await deactivateUser(manage, { actor, userId: id });
      logger.info('user deactivated', { actorId: actor, userId: id });
      return c.json(toAdminUser(user));
    })
    .post('/:id/reactivate', validate('param', UserParams), async (c) => {
      const actor = c.var.currentUser.id;
      const { id } = c.req.valid('param');
      const user = await reactivateUser(manage, { actor, userId: id });
      logger.info('user reactivated', { actorId: actor, userId: id });
      return c.json(toAdminUser(user));
    });
};
