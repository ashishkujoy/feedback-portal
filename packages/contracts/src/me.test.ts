import { describe, expect, it } from 'vitest';
import { MeResponse } from './me.ts';

const me = {
  id: '01890a5d-ac96-774b-bcce-b302099a8057',
  email: 'mentor@example.com',
  name: 'A Mentor',
  avatarUrl: null,
  roles: ['admin', 'mentor'],
};

describe('MeResponse', () => {
  it('accepts a signed-in user, with or without an avatar', () => {
    expect(MeResponse.parse(me)).toEqual(me);
    const withAvatar = { ...me, avatarUrl: 'https://example.com/a.png' };
    expect(MeResponse.parse(withAvatar)).toEqual(withAvatar);
  });

  it('rejects a user without roles, or with an unknown role', () => {
    expect(MeResponse.safeParse({ ...me, roles: [] }).success).toBe(false);
    expect(MeResponse.safeParse({ ...me, roles: ['owner'] }).success).toBe(false);
  });
});
