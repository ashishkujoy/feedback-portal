import { describe, expect, it } from 'vitest';
import { SettingsResponse } from './settings.ts';

const settings = { programName: 'Test Programme', orgName: 'Test Org', photos: false };

describe('SettingsResponse', () => {
  it('accepts both names and the photos flag', () => {
    expect(SettingsResponse.parse(settings)).toEqual(settings);
  });

  it('rejects an empty or missing name', () => {
    expect(SettingsResponse.safeParse({ ...settings, programName: '' }).success).toBe(false);
    expect(SettingsResponse.safeParse({ programName: 'Test Programme' }).success).toBe(false);
    expect(SettingsResponse.safeParse({ ...settings, photos: undefined }).success).toBe(false);
  });
});
