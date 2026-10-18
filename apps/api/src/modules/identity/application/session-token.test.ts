import { describe, expect, it } from 'vitest';
import { generateToken, hashToken, isWellFormedToken } from './session-token.ts';

describe('session tokens', () => {
  it('generates 43 base64url characters', () => {
    const token = generateToken();

    expect(token).toMatch(/^[\w-]{43}$/);
    expect(isWellFormedToken(token)).toBe(true);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateToken));

    expect(tokens.size).toBe(1000);
  });

  it.each(['', 'short', `${'a'.repeat(42)}=`, 'a'.repeat(44), `${'a'.repeat(42)}/`])(
    'rejects malformed token %j',
    (token) => {
      expect(isWellFormedToken(token)).toBe(false);
    },
  );

  it('hashes with SHA-256 (hex)', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const token = generateToken();
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });
});
