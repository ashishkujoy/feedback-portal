import { SettingsResponse } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { appDeps, testBranding } from '../../../test/app-deps.ts';
import { createApp } from '../../app.ts';

describe('GET /settings', () => {
  it('returns the configured names without a session, cacheable for 5 minutes', async () => {
    const res = await createApp(appDeps(() => Promise.resolve())).request('/settings');

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(SettingsResponse.parse(await res.json())).toEqual(testBranding);
  });

  it('returns only the two names, nothing else from config', async () => {
    const res = await createApp(appDeps(() => Promise.resolve())).request('/settings');

    expect(await res.json()).toStrictEqual(testBranding);
  });
});
