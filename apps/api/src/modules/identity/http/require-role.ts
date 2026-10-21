import type { Role } from '@feedback-portal/contracts';
import { createMiddleware } from 'hono/factory';
import { forbidden } from '../../../shared/errors/app-error.ts';
import { hasRole } from '../domain/user.ts';
import type { AuthEnv } from './auth-env.ts';

/** After `authenticate`: 403 unless the current user holds at least one of `roles`. */
export const requireRole = (...roles: readonly [Role, ...Role[]]) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get('currentUser');
    if (!roles.some((role) => hasRole(user, role))) {
      throw forbidden(`Requires one of: ${roles.join(', ')}`);
    }
    await next();
  });
