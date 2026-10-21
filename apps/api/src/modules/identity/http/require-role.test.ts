import type { Role } from '@feedback-portal/contracts';
import { ProblemDetails } from '@feedback-portal/contracts';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createBaseApp } from '../../../app.ts';
import { createUser } from '../domain/user.ts';
import { newUserId } from '../domain/user-id.ts';
import type { AuthEnv } from './auth-env.ts';
import { requireRole } from './require-role.ts';

/** Stands in for `authenticate`: the current user holds exactly `held`. */
const appFor = (held: readonly [Role, ...Role[]], ...required: readonly [Role, ...Role[]]) => {
  const user = createUser({
    id: newUserId(),
    email: 'someone@example.com',
    name: 'Someone',
    roles: [...held],
    grantedBy: null,
    now: new Date(),
  });
  const routes = new Hono<AuthEnv>()
    .use(async (c, next) => {
      c.set('currentUser', user);
      await next();
    })
    .get('/', requireRole(...required), (c) => c.text('ok'));
  return createBaseApp().route('/guarded', routes);
};

describe('requireRole', () => {
  it('lets through a user holding the role', async () => {
    expect((await appFor(['admin'], 'admin').request('/guarded')).status).toBe(200);
  });

  it('lets through a user holding any one of several roles', async () => {
    const app = appFor(['mentor'], 'admin', 'program_manager', 'mentor');
    expect((await app.request('/guarded')).status).toBe(200);
  });

  it('answers 403 problem+json to anyone else', async () => {
    const response = await appFor(['mentor', 'program_manager'], 'admin').request('/guarded');

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(ProblemDetails.parse(await response.json())).toMatchObject({
      code: 'forbidden',
      detail: 'Requires one of: admin',
    });
  });
});
