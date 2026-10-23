import type { AdminUser, Role } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { byName, byRole, matches, tabCounts } from './filter-users.ts';

const user = (name: string, email: string, roles: [Role, ...Role[]]): AdminUser => ({
  id: '01890a5d-ac96-774b-bcce-b302099a8057',
  email,
  name,
  avatarUrl: null,
  isActive: true,
  roles,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const ada = user('Ada Lovelace', 'ada@example.com', ['admin', 'mentor']);
const grace = user('Grace Hopper', 'grace@example.com', ['program_manager', 'mentor']);
const alan = user('Alan Turing', 'alan@example.com', ['mentor']);
const users = [ada, grace, alan];

describe('byRole', () => {
  it('keeps everyone for All, and puts multi-role users in each of their tabs', () => {
    expect(byRole(users, undefined)).toEqual(users);
    expect(byRole(users, 'admin')).toEqual([ada]);
    expect(byRole(users, 'program_manager')).toEqual([grace]);
    expect(byRole(users, 'mentor')).toEqual([ada, grace, alan]);
  });
});

describe('matches', () => {
  it('matches name or email, ignoring case and surrounding spaces', () => {
    expect(matches(ada, 'LOVE')).toBe(true);
    expect(matches(ada, '  ada@exa ')).toBe(true);
    expect(matches(ada, 'grace')).toBe(false);
  });

  it('matches everyone for a blank search', () => {
    expect(matches(ada, '')).toBe(true);
    expect(matches(ada, '   ')).toBe(true);
  });
});

describe('tabCounts', () => {
  it('counts each tab, multi-role users in each of theirs', () => {
    expect(tabCounts(users)).toEqual({ all: 3, admin: 1, program_manager: 1, mentor: 3 });
  });
});

describe('byName', () => {
  it('sorts ignoring case and accents', () => {
    const zoe = user('zoë Adams', 'zoe@example.com', ['mentor']);
    const bob = user('Bob Brown', 'bob@example.com', ['mentor']);
    const eve = user('Éve Clark', 'eve@example.com', ['mentor']);

    expect(byName([zoe, bob, eve]).map((u) => u.name)).toEqual([
      'Bob Brown',
      'Éve Clark',
      'zoë Adams',
    ]);
  });
});
