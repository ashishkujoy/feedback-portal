import { describe, expect, it } from 'vitest';
import { AdminUser, CreateUserRequest, SetRolesRequest } from './admin-user.ts';

const user = {
  id: '01890a5d-ac96-774b-bcce-b302099a8057',
  email: 'mentor@example.com',
  name: 'A Mentor',
  avatarUrl: null,
  isActive: false,
  roles: ['mentor'],
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('AdminUser', () => {
  it('accepts a user, signed in or not', () => {
    expect(AdminUser.parse(user)).toEqual(user);
    const signedIn = { ...user, lastLoginAt: '2026-02-01T10:00:00.000Z' };
    expect(AdminUser.parse(signedIn)).toEqual(signedIn);
  });

  it('rejects a user without roles or with a non-ISO date', () => {
    expect(AdminUser.safeParse({ ...user, roles: [] }).success).toBe(false);
    expect(AdminUser.safeParse({ ...user, createdAt: 'yesterday' }).success).toBe(false);
  });
});

describe('CreateUserRequest', () => {
  it('normalises the email and trims the name', () => {
    expect(
      CreateUserRequest.parse({ email: ' A@Example.COM ', name: ' Ann ', roles: ['admin'] }),
    ).toEqual({ email: 'a@example.com', name: 'Ann', roles: ['admin'] });
  });

  it('reports every invalid field', () => {
    const result = CreateUserRequest.safeParse({ email: 'nope', name: '  ', roles: [] });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['email', 'Invalid email address'],
      ['name', 'Name is required'],
      ['roles', 'At least one role is required'],
    ]);
  });
});

describe('SetRolesRequest', () => {
  it('needs at least one known role', () => {
    expect(SetRolesRequest.parse({ roles: ['mentor', 'admin'] })).toEqual({
      roles: ['mentor', 'admin'],
    });
    expect(SetRolesRequest.safeParse({ roles: [] }).success).toBe(false);
    expect(SetRolesRequest.safeParse({ roles: ['owner'] }).success).toBe(false);
  });
});
