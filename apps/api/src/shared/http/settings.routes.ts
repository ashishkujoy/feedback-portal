import { SettingsResponse } from '@feedback-portal/contracts';
import { Hono } from 'hono';
import type { AppEnv } from './app-env.ts';

export type SettingsDeps = Readonly<{
  branding: Readonly<{ programName: string; orgName: string }>;
  /** Intern photos are on (Cloudinary is configured). */
  photosEnabled: boolean;
}>;

/** Names only change when the API restarts with new config. */
const cacheControl = 'public, max-age=300';

/**
 * `GET /settings` — the program and organisation names from config, and whether photos are on.
 * Public: the sign-in page shows the names before anyone has a session.
 */
export const settingsRoutes = ({ branding, photosEnabled }: SettingsDeps) =>
  new Hono<AppEnv>().get('/', (c) => {
    c.header('cache-control', cacheControl);
    return c.json<SettingsResponse>(SettingsResponse.parse({ ...branding, photos: photosEnabled }));
  });
