import { describe, expect, it } from 'vitest';
import { AppError } from '../../../shared/errors/app-error.ts';
import { newId } from '../../../shared/ids.ts';
import {
  createUser,
  deactivate,
  ensureAnAdminRemains,
  grantRole,
  hasRole,
  reactivate,
  revokeRole,
  roleSet,
  signIn,
  type CreateUserInput,
  type User,
} from './user.ts';
import { UserId } from './user-id.ts';

const t0 = new Date('2026-01-01T09:00:00Z');
const t1 = new Date('2026-01-02T09:00:00Z');
const userId = (): UserId => UserId.parse(newId());
const admin = userId();

const input = (overrides: Partial<CreateUserInput> = {}): CreateUserInput => ({
  id: userId(),
  email: 'a.person@example.com',
  name: 'A Person',
  roles: ['mentor'],
  grantedBy: admin,
  now: t0,
  ...overrides,
});

const errorOf = (action: () => unknown): AppError => {
  try {
    action();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('expected an AppError');
};

const signedIn = (user: User): User =>
  signIn(user, { googleSub: 'google-1', avatarUrl: null, now: t0 });

describe('createUser', () => {
  it('creates an active user with normalised email and the given grants', () => {
    const id = userId();

    expect(createUser(input({ id, email: ' A.Person@Example.COM ', name: '  A Person ' }))).toEqual(
      {
        id,
        email: 'a.person@example.com',
        name: 'A Person',
        googleSub: null,
        avatarUrl: null,
        isActive: true,
        lastLoginAt: null,
        roles: [{ role: 'mentor', grantedBy: admin, grantedAt: t0 }],
        createdAt: t0,
        updatedAt: t0,
      },
    );
  });

  it('collapses duplicate roles and supports several roles', () => {
    const user = createUser(input({ roles: ['mentor', 'program_manager', 'mentor'] }));

    expect(user.roles.map((grant) => grant.role)).toEqual(['mentor', 'program_manager']);
  });

  it('records a system grant as grantedBy null', () => {
    expect(createUser(input({ roles: ['admin'], grantedBy: null })).roles).toEqual([
      { role: 'admin', grantedBy: null, grantedAt: t0 },
    ]);
  });

  it.each([
    ['a blank name', { name: '   ' }, 'name'],
    ['a name over 200 characters', { name: 'x'.repeat(201) }, 'name'],
    ['no roles', { roles: [] }, 'roles'],
    ['an invalid email', { email: 'not-an-email' }, 'email'],
  ] as const)('rejects %s', (_, overrides, path) => {
    expect(errorOf(() => createUser(input(overrides)))).toMatchObject({
      code: 'validation_failed',
      issues: [{ path, message: expect.any(String) }],
    });
  });

  it('reports every invalid field at once', () => {
    const error = errorOf(() => createUser(input({ email: '', name: '', roles: [] })));

    expect(error.issues?.map((issue) => issue.path)).toEqual(['email', 'name', 'roles']);
  });

  it('accepts a 200-character name', () => {
    expect(createUser(input({ name: 'x'.repeat(200) })).name).toHaveLength(200);
  });
});

describe('roles', () => {
  const mentor = createUser(input());

  it('answers role queries', () => {
    expect(hasRole(mentor, 'mentor')).toBe(true);
    expect(hasRole(mentor, 'admin')).toBe(false);
    expect(roleSet(mentor)).toEqual(new Set(['mentor']));
  });

  it('grants a new role', () => {
    const next = grantRole(mentor, 'program_manager', { by: admin, now: t1 });

    expect(next.roles).toEqual([
      ...mentor.roles,
      { role: 'program_manager', grantedBy: admin, grantedAt: t1 },
    ]);
    expect(next.updatedAt).toBe(t1);
    expect(mentor.roles).toHaveLength(1);
  });

  it('returns the same user when granting a held role', () => {
    expect(grantRole(mentor, 'mentor', { by: admin, now: t1 })).toBe(mentor);
  });

  it('revokes a role', () => {
    const both = grantRole(mentor, 'program_manager', { by: admin, now: t0 });
    const next = revokeRole(both, 'mentor', { now: t1 });

    expect(roleSet(next)).toEqual(new Set(['program_manager']));
    expect(next.updatedAt).toBe(t1);
  });

  it('returns the same user when revoking a role it does not hold', () => {
    expect(revokeRole(mentor, 'admin', { now: t1 })).toBe(mentor);
  });

  it('rejects revoking the last role', () => {
    expect(errorOf(() => revokeRole(mentor, 'mentor', { now: t1 }))).toMatchObject({
      kind: 'conflict',
      code: 'user_requires_role',
    });
  });
});

describe('deactivate / reactivate', () => {
  const user = createUser(input());

  it('deactivates and reactivates', () => {
    const inactive = deactivate(user, { by: admin, now: t1 });
    const active = reactivate(inactive, { now: t1 });

    expect(inactive).toMatchObject({ isActive: false, updatedAt: t1 });
    expect(active).toMatchObject({ isActive: true, updatedAt: t1 });
  });

  it('returns the same user when nothing changes', () => {
    const inactive = deactivate(user, { by: admin, now: t1 });

    expect(deactivate(inactive, { by: admin, now: t1 })).toBe(inactive);
    expect(reactivate(user, { now: t1 })).toBe(user);
  });

  it('rejects deactivating yourself', () => {
    expect(errorOf(() => deactivate(user, { by: user.id, now: t1 }))).toMatchObject({
      kind: 'conflict',
      code: 'cannot_deactivate_self',
    });
  });
});

describe('signIn', () => {
  const user = createUser(input());

  it('links googleSub on the first sign-in', () => {
    expect(
      signIn(user, { googleSub: 'google-1', avatarUrl: 'https://a/b.png', now: t1 }),
    ).toMatchObject({
      googleSub: 'google-1',
      avatarUrl: 'https://a/b.png',
      lastLoginAt: t1,
      updatedAt: t1,
    });
  });

  it('accepts a later sign-in with the same googleSub', () => {
    expect(
      signIn(signedIn(user), { googleSub: 'google-1', avatarUrl: null, now: t1 }),
    ).toMatchObject({
      lastLoginAt: t1,
    });
  });

  it.each([
    [
      'a different Google account',
      () => signIn(signedIn(user), { googleSub: 'google-2', avatarUrl: null, now: t1 }),
    ],
    ['an inactive user', () => signedIn(deactivate(user, { by: admin, now: t0 }))],
  ])('rejects %s with the generic message', (_, action) => {
    expect(errorOf(action)).toMatchObject({
      kind: 'unauthenticated',
      code: 'unauthenticated',
      message: 'Sign-in failed',
    });
  });
});

describe('ensureAnAdminRemains', () => {
  it('rejects zero active admins', () => {
    expect(errorOf(() => ensureAnAdminRemains(0))).toMatchObject({
      kind: 'conflict',
      code: 'conflict',
    });
  });

  it.each([1, 2])('accepts %i', (count) => {
    expect(() => ensureAnAdminRemains(count)).not.toThrow();
  });
});
