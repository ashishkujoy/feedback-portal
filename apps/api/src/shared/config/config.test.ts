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
      auth: { google: null, webAppUrl: 'http://localhost:5173', secureCookies: false },
      airtable: { apiBaseUrl: 'https://api.airtable.com' },
      photos: null,
      bootstrapAdmin: null,
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

  describe('bootstrapAdmin', () => {
    it('is set from BOOTSTRAP_ADMIN_EMAIL, with an optional name', () => {
      expect(
        loadConfig({ ...validEnv, BOOTSTRAP_ADMIN_EMAIL: ' admin@example.com ' }).bootstrapAdmin,
      ).toEqual({ email: 'admin@example.com', name: null });
      expect(
        loadConfig({
          ...validEnv,
          BOOTSTRAP_ADMIN_EMAIL: 'admin@example.com',
          BOOTSTRAP_ADMIN_NAME: 'First Admin',
        }).bootstrapAdmin,
      ).toEqual({ email: 'admin@example.com', name: 'First Admin' });
    });

    it('is null without an email, even if a name is set', () => {
      expect(loadConfig({ ...validEnv, BOOTSTRAP_ADMIN_NAME: 'First Admin' }).bootstrapAdmin).toBe(
        null,
      );
    });

    it('rejects an invalid email and an over-long name', () => {
      expect(
        issuesFor({
          ...validEnv,
          BOOTSTRAP_ADMIN_EMAIL: 'not-an-email',
          BOOTSTRAP_ADMIN_NAME: 'x'.repeat(201),
        }),
      ).toEqual([
        { key: 'BOOTSTRAP_ADMIN_EMAIL', message: 'expected an email address' },
        { key: 'BOOTSTRAP_ADMIN_NAME', message: 'expected at most 200 characters' },
      ]);
    });
  });

  describe('auth', () => {
    const google = { GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret' };

    it('enables Google only when both the ID and the secret are set', () => {
      expect(loadConfig({ ...validEnv, GOOGLE_CLIENT_ID: 'client-id' }).auth.google).toBeNull();
      expect(loadConfig({ ...validEnv, GOOGLE_CLIENT_SECRET: 'secret' }).auth.google).toBeNull();
      expect(loadConfig({ ...validEnv, ...google }).auth.google).toEqual({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'http://localhost:5173/api/auth/google/callback',
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
      });
    });

    it('takes a stand-in for Google from the endpoint URLs', () => {
      const { auth } = loadConfig({
        ...validEnv,
        ...google,
        GOOGLE_AUTHORIZATION_URL: 'http://fake-google:4000/authorize',
        GOOGLE_TOKEN_URL: 'http://fake-google:4000/token',
      });

      expect(auth.google).toMatchObject({
        authorizationEndpoint: 'http://fake-google:4000/authorize',
        tokenEndpoint: 'http://fake-google:4000/token',
      });
    });

    it('rejects endpoint URLs that are not http(s)', () => {
      expect(
        issuesFor({
          ...validEnv,
          GOOGLE_AUTHORIZATION_URL: 'fake-google/authorize',
          GOOGLE_TOKEN_URL: 'ftp://fake-google/token',
        }),
      ).toEqual([
        { key: 'GOOGLE_AUTHORIZATION_URL', message: 'expected an http:// or https:// URL' },
        { key: 'GOOGLE_TOKEN_URL', message: 'expected an http:// or https:// URL' },
      ]);
    });

    it('uses the supplied URLs, without a trailing slash on the web app', () => {
      const { auth } = loadConfig({
        ...validEnv,
        ...google,
        GOOGLE_REDIRECT_URI: 'https://portal.example.com/auth/google/callback',
        WEB_APP_URL: 'https://portal.example.com/',
      });

      expect(auth.google?.redirectUri).toBe('https://portal.example.com/auth/google/callback');
      expect(auth.webAppUrl).toBe('https://portal.example.com');
    });

    it('uses secure cookies in production only', () => {
      expect(loadConfig({ ...validEnv, NODE_ENV: 'production' }).auth.secureCookies).toBe(true);
      expect(loadConfig({ ...validEnv, NODE_ENV: 'test' }).auth.secureCookies).toBe(false);
    });

    it('rejects non-http URLs', () => {
      expect(
        issuesFor({ ...validEnv, GOOGLE_REDIRECT_URI: 'ftp://x/cb', WEB_APP_URL: 'localhost' }).map(
          ({ key }) => key,
        ),
      ).toEqual(['GOOGLE_REDIRECT_URI', 'WEB_APP_URL']);
    });
  });
});

describe('photos', () => {
  it('are off without CLOUDINARY_URL', () => {
    expect(loadConfig(validEnv).photos).toBeNull();
  });

  it("read Cloudinary's URL, with the folder and Cloudinary's own hosts by default", () => {
    expect(
      loadConfig({ ...validEnv, CLOUDINARY_URL: 'cloudinary://key-1:s%40cret@demo-cloud' }).photos,
    ).toEqual({
      cloudName: 'demo-cloud',
      apiKey: 'key-1',
      apiSecret: 's@cret',
      folder: 'feedback-portal/interns',
      apiBaseUrl: 'https://api.cloudinary.com',
      deliveryBaseUrl: 'https://res.cloudinary.com',
    });
  });

  it('reject a malformed URL or folder, naming only the variable', () => {
    const error = (() => {
      try {
        loadConfig({
          ...validEnv,
          CLOUDINARY_URL: 'https://key:zq81wvx@demo',
          CLOUDINARY_FOLDER: '../up',
        });
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(ConfigError);
    expect(String(error)).not.toContain('zq81wvx');
    expect(error instanceof ConfigError ? error.issues.map((issue) => issue.key) : []).toEqual([
      'CLOUDINARY_URL',
      'CLOUDINARY_FOLDER',
    ]);
  });
});
