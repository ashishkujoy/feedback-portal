import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.ts';

const dbUrl = 'postgres://user:pw@localhost:5432/app';
const validEnv = { PROGRAM_NAME: 'Test Program', ORG_NAME: 'Test Org', DATABASE_URL: dbUrl };

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
      db: { url: dbUrl, poolMax: 10 },
      branding: { programName: 'Test Program', orgName: 'Test Org' },
      telemetry: { enabled: false },
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
      { key: 'DATABASE_URL', message: 'required' },
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

  it.each(['postgresql://h/db', 'postgres://u:p@h:5433/db?sslmode=require'])(
    'accepts DATABASE_URL %s',
    (url) => {
      expect(loadConfig({ ...validEnv, DATABASE_URL: url }).db.url).toBe(url);
    },
  );

  it.each(['mysql://h/db', 'localhost:5432/db', 'not a url'])('rejects DATABASE_URL %s', (url) => {
    expect(issuesFor({ ...validEnv, DATABASE_URL: url })).toEqual([
      { key: 'DATABASE_URL', message: 'expected a postgres:// or postgresql:// URL' },
    ]);
  });

  it('reads DATABASE_POOL_MAX and rejects out-of-range values', () => {
    expect(loadConfig({ ...validEnv, DATABASE_POOL_MAX: '25' }).db.poolMax).toBe(25);
    for (const value of ['0', '101', 'x']) {
      expect(issuesFor({ ...validEnv, DATABASE_POOL_MAX: value })).toEqual([
        { key: 'DATABASE_POOL_MAX', message: 'expected an integer between 1 and 100' },
      ]);
    }
  });

  it('never includes supplied values in the error message', () => {
    const secret = 'sentinel-secret-value';
    let message = '';
    try {
      loadConfig({ PORT: secret, NODE_ENV: secret, DATABASE_URL: `mysql://u:${secret}@h/db` });
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
    expect(Object.isFrozen(config.db)).toBe(true);
    expect(Object.isFrozen(config.branding)).toBe(true);
  });

  it('ignores unknown variables', () => {
    expect(loadConfig({ ...validEnv, SOMETHING_ELSE: 'x', PATH: '/bin' })).toEqual(
      loadConfig(validEnv),
    );
  });

  describe('telemetry', () => {
    const endpoint = 'http://localhost:4318';

    it('is off when no OTLP endpoint is set', () => {
      expect(loadConfig(validEnv).telemetry).toEqual({ enabled: false });
    });

    it('is on with an endpoint, with defaults', () => {
      expect(loadConfig({ ...validEnv, OTEL_EXPORTER_OTLP_ENDPOINT: endpoint }).telemetry).toEqual({
        enabled: true,
        endpoint,
        serviceName: 'feedback-portal-api',
        metricExportIntervalMs: 60_000,
      });
    });

    it('uses OTEL_SERVICE_NAME and OTEL_METRIC_EXPORT_INTERVAL', () => {
      const { telemetry } = loadConfig({
        ...validEnv,
        OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
        OTEL_SERVICE_NAME: 'api-test',
        OTEL_METRIC_EXPORT_INTERVAL: '5000',
      });
      expect(telemetry).toMatchObject({ serviceName: 'api-test', metricExportIntervalMs: 5000 });
    });

    it('is forced off by OTEL_SDK_DISABLED=true', () => {
      const env = { ...validEnv, OTEL_EXPORTER_OTLP_ENDPOINT: endpoint, OTEL_SDK_DISABLED: 'true' };
      expect(loadConfig(env).telemetry).toEqual({ enabled: false });
    });

    it('rejects invalid values', () => {
      expect(
        issuesFor({
          ...validEnv,
          OTEL_EXPORTER_OTLP_ENDPOINT: 'localhost:4318',
          OTEL_SDK_DISABLED: 'yes',
          OTEL_METRIC_EXPORT_INTERVAL: '10',
        }).map(({ key }) => key),
      ).toEqual([
        'OTEL_EXPORTER_OTLP_ENDPOINT',
        'OTEL_SDK_DISABLED',
        'OTEL_METRIC_EXPORT_INTERVAL',
      ]);
    });
  });
});
