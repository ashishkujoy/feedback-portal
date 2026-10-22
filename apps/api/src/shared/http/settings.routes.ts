import { SettingsResponse } from '@feedback-portal/contracts';
import { Hono } from 'hono';
import type { AppEnv } from './app-env.ts';

export type SettingsDeps = Readonly<{
  branding: Readonly<{ programName: string; orgName: string }>;
}>;

/** Names only change when the API restarts with new config. */
const cacheControl = 'public, max-age=300';

/**
 * `GET /settings` — the program and organisation names from config. Public: the sign-in page
 * shows them before anyone has a session.
 */
export const settingsRoutes = ({ branding }: SettingsDeps) =>
  new Hono<AppEnv>().get('/', (c) => {
    c.header('cache-control', cacheControl);
    return c.json<SettingsResponse>(SettingsResponse.parse(branding));
  });
