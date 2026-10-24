import { SettingsResponse } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { appDeps, testBranding } from '../../../test/app-deps.ts';
import { createApp } from '../../app.ts';

describe('GET /settings', () => {
  it('returns the configured names and the photos flag without a session, cacheable for 5 minutes', async () => {
    const res = await createApp(appDeps(() => Promise.resolve())).request('/settings');

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(SettingsResponse.parse(await res.json())).toEqual({ ...testBranding, photos: false });
  });

  it('returns only the names and the photos flag, nothing else from config', async () => {
    const res = await createApp(appDeps(() => Promise.resolve())).request('/settings');

    expect(await res.json()).toStrictEqual({ ...testBranding, photos: false });
  });
});
