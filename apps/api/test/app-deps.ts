import type { Role } from '@feedback-portal/contracts';
import { type AppDeps, createApp } from '../src/app.ts';
import type { ManageBatchesDeps } from '../src/modules/cohort/application/manage-batches.ts';
import { createBatchAccess } from '../src/modules/cohort/infrastructure/drizzle-batch-access.ts';
import { createBatchAdminTransaction } from '../src/modules/cohort/infrastructure/drizzle-batch-admin.ts';
import { createBatchQueries } from '../src/modules/cohort/infrastructure/drizzle-batch-queries.ts';
import { createRoleAssignments } from '../src/modules/cohort/infrastructure/drizzle-role-assignments.ts';
import type { GoogleAuth } from '../src/modules/identity/application/google-auth.ts';
import { createSessions, type Sessions } from '../src/modules/identity/application/sessions.ts';
import type { UserRepository } from '../src/modules/identity/application/user-repository.ts';
import { createUser, deactivate, type User } from '../src/modules/identity/domain/user.ts';
import { newUserId } from '../src/modules/identity/domain/user-id.ts';
import type { AuthRoutesDeps } from '../src/modules/identity/http/auth.routes.ts';
import { createSessionRepository } from '../src/modules/identity/infrastructure/drizzle-session-repository.ts';
import { createUserAdminTransaction } from '../src/modules/identity/infrastructure/drizzle-user-admin.ts';
import { createUserRepository } from '../src/modules/identity/infrastructure/drizzle-user-repository.ts';
import { createInternCounts } from '../src/modules/intern/infrastructure/drizzle-intern-counts.ts';
import type { ManageInternsDeps } from '../src/modules/intern/application/manage-interns.ts';
import type { AirtableSource } from '../src/modules/intern/application/airtable-source.ts';
import type { PhotoStorage } from '../src/modules/intern/application/photo-storage.ts';
import { createInternAdminTransaction } from '../src/modules/intern/infrastructure/drizzle-intern-admin.ts';
import type { Database } from '../src/shared/db/client.ts';

const unused = (): never => {
  throw new Error('not used by this test');
};

/** Auth deps for tests that don't exercise sign-in: Google off, repositories never called. */
export const unusedAuthDeps: AuthRoutesDeps = {
  users: {
    findById: unused,
    findByEmail: unused,
    list: unused,
    save: unused,
    countActiveAdmins: unused,
  },
  sessions: { create: unused, validate: unused, revoke: unused, revokeAllForUser: unused },
  googleAuth: null,
  webAppUrl: 'http://web.test',
  secureCookies: false,
  now: () => new Date(),
};

/** Neutral names for tests; real ones only ever come from config. */
export const testBranding = { programName: 'Test Programme', orgName: 'Test Org' };

const unusedManageBatches: ManageBatchesDeps = {
  transaction: unused,
  queries: { listSummaries: unused, detail: unused, mentorCandidates: unused },
  now: () => new Date(),
};

const unusedAirtable: AirtableSource = { fetchRecords: unused };

const unusedManageInterns: ManageInternsDeps = {
  transaction: unused,
  airtable: unusedAirtable,
  photos: null,
  now: () => new Date(),
};

export const appDeps = (ping: AppDeps['ping']): AppDeps => ({
  ping,
  branding: testBranding,
  photosEnabled: false,
  auth: unusedAuthDeps,
  userAdmin: unused,
  manageBatches: unusedManageBatches,
  manageInterns: unusedManageInterns,
});

type SignInAsOptions = Readonly<{
  name?: string;
  roles?: readonly [Role, ...Role[]];
  active?: boolean;
  secureCookies?: boolean;
}>;

/**
 * Saves a user and starts a session for them, skipping Google, so route tests can call protected
 * routes. `cookie` is the request header value.
 */
export const signInAs = async (
  {
    users,
    sessions,
    now = () => new Date(),
  }: Readonly<{ users: UserRepository; sessions: Sessions; now?: () => Date }>,
  {
    name = 'Signed In',
    roles = ['mentor'],
    active = true,
    secureCookies = false,
  }: SignInAsOptions = {},
) => {
  const at = now();
  let user: User = createUser({
    id: newUserId(),
    email: `${newUserId()}@example.com`,
    name,
    roles: [...roles],
    grantedBy: null,
    now: at,
  });
  if (!active) user = deactivate(user, { by: newUserId(), now: at });
  await users.save(user);
  const { token, session } = await sessions.create(user.id, { userAgent: null, ip: null });
  const cookieName = secureCookies ? '__Host-session' : 'session';
  return { user, token, session, cookie: `${cookieName}=${token}` };
};

/**
 * The full app on real repositories (Google off unless given), with a clock the test can move. `signInAs`
 * is bound to the same repositories.
 */
export const realApp = (
  db: Database,
  {
    secureCookies = false,
    googleAuth = null,
    photos = null,
    airtable = unusedAirtable,
  }: Readonly<{
    secureCookies?: boolean;
    googleAuth?: GoogleAuth | null;
    photos?: PhotoStorage | null;
    airtable?: AirtableSource;
  }> = {},
) => {
  let current = new Date();
  const now = () => current;
  const users = createUserRepository(db);
  const sessions = createSessions({ sessions: createSessionRepository(db), now });
  const app = createApp({
    ping: () => Promise.resolve(),
    branding: testBranding,
    photosEnabled: photos !== null,
    auth: { users, sessions, googleAuth, webAppUrl: 'http://web.test', secureCookies, now },
    userAdmin: createUserAdminTransaction(db, now, createRoleAssignments),
    manageBatches: {
      transaction: createBatchAdminTransaction(db, createInternCounts),
      queries: createBatchQueries(db, createInternCounts),
      now,
    },
    manageInterns: {
      transaction: createInternAdminTransaction(db, createBatchAccess),
      airtable,
      photos,
      now,
    },
  });
  return {
    app,
    users,
    sessions,
    webAppUrl: 'http://web.test',
    signedInUser: (options: SignInAsOptions = {}) =>
      signInAs({ users, sessions, now }, { secureCookies, ...options }),
    travel: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
};
