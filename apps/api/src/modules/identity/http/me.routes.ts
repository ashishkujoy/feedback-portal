import { Hono } from 'hono';
import type { AuthEnv } from './auth-env.ts';
import { type AuthenticateDeps, authenticate } from './authenticate.ts';
import { toMeResponse } from './user-views.ts';

/** `GET /me`: the signed-in user, for the web app's shell. Never cached. */
export const meRoutes = (deps: AuthenticateDeps) =>
  new Hono<AuthEnv>().get('/', authenticate(deps), (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(toMeResponse(c.var.currentUser));
  });
