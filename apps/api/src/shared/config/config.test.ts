import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.ts';

const validEnv = { PROGRAM_NAME: 'Test Program', ORG_NAME: 'Test Org' };

const issuesFor = (env: NodeJS.ProcessEnv): readonly { key: string; message: string }[] => {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.issues;
    throw error;
  }
  throw new Error('expected loadConfig to throw');
};

describe('loadConfig', () => {
  it('maps a valid env to nested config with defaults', () => {
    expect(loadConfig(validEnv)).toEqual({
      env: 'development',
      server: { host: '0.0.0.0', port: 3000 },
      log: { level: 'info', format: 'json' },
      branding: { programName: 'Test Program', orgName: 'Test Org' },
    });
  });

  it('uses supplied values over defaults', () => {
    const config = loadConfig({
      ...validEnv,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '8080',
      LOG_LEVEL: 'debug',
      LOG_FORMAT: 'pretty',
    });

    expect(config.env).toBe('production');
    expect(config.server).toEqual({ host: '127.0.0.1', port: 8080 });
    expect(config.log).toEqual({ level: 'debug', format: 'pretty' });
  });

  it('trims values', () => {
    expect(loadConfig({ ...validEnv, PROGRAM_NAME: '  Spaced  ' }).branding.programName).toBe(
      'Spaced',
    );
  });

  it('reports every missing required variable at once', () => {
    expect(issuesFor({})).toEqual([
      { key: 'PROGRAM_NAME', message: 'required' },
      { key: 'ORG_NAME', message: 'required' },
    ]);
  });

  it.each(['', '   '])('treats blank PROGRAM_NAME %j as missing', (value) => {
    expect(issuesFor({ ...validEnv, PROGRAM_NAME: value })).toEqual([
      { key: 'PROGRAM_NAME', message: 'required' },
    ]);
  });

  it.each(['abc', '0', '70000', '3.5', '-1'])('rejects PORT=%s', (port) => {
    expect(issuesFor({ ...validEnv, PORT: port })).toEqual([
      { key: 'PORT', message: 'expected an integer between 1 and 65535' },
    ]);
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(issuesFor({ ...validEnv, NODE_ENV: 'staging' })).toEqual([
      { key: 'NODE_ENV', message: 'expected one of development, test, production' },
    ]);
  });

  it('rejects invalid LOG_LEVEL and LOG_FORMAT', () => {
    expect(issuesFor({ ...validEnv, LOG_LEVEL: 'verbose', LOG_FORMAT: 'xml' })).toEqual([
      { key: 'LOG_LEVEL', message: 'expected one of trace, debug, info, warning, error, fatal' },
      { key: 'LOG_FORMAT', message: 'expected one of json, pretty' },
    ]);
  });

  it('never includes supplied values in the error message', () => {
    const secret = 'sentinel-secret-value';
    let message = '';
    try {
      loadConfig({ PORT: secret, NODE_ENV: secret });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('Invalid configuration:');
    expect(message).not.toContain(secret);
  });

  it('returns a deeply frozen object', () => {
    const config = loadConfig(validEnv);

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.server)).toBe(true);
    expect(Object.isFrozen(config.log)).toBe(true);
    expect(Object.isFrozen(config.branding)).toBe(true);
  });

  it('ignores unknown variables', () => {
    expect(loadConfig({ ...validEnv, SOMETHING_ELSE: 'x', PATH: '/bin' })).toEqual(
      loadConfig(validEnv),
    );
  });
});
