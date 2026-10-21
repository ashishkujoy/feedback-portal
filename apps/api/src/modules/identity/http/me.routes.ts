import { type MeResponse, roles as allRoles } from '@feedback-portal/contracts';
import { Hono } from 'hono';
import { roleSet, type User } from '../domain/user.ts';
import type { AuthEnv } from './auth-env.ts';
import { type AuthenticateDeps, authenticate } from './authenticate.ts';

const toMeResponse = (user: User): MeResponse => {
  const held = roleSet(user);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    roles: allRoles.filter((role) => held.has(role)),
  };
};

/** `GET /me`: the signed-in user, for the web app's shell. Never cached. */
export const meRoutes = (deps: AuthenticateDeps) =>
  new Hono<AuthEnv>().get('/', authenticate(deps), (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(toMeResponse(c.var.currentUser));
  });
