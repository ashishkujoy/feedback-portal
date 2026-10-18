import { createHash, randomBytes } from 'node:crypto';

const tokenBytes = 32;
const tokenPattern = /^[\w-]{43}$/;

/** 256 random bits, base64url (43 characters). Unguessable, so the cookie needs no signature. */
export const generateToken = (): string => randomBytes(tokenBytes).toString('base64url');

/** Cheap shape check before touching the database. */
export const isWellFormedToken = (token: string): boolean => tokenPattern.test(token);

/** The stored session id: SHA-256 hex, so a leaked table can't be turned back into cookies. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
