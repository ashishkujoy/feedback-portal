import { z } from 'zod';

const required = z.string({ error: 'required' });
const portError = 'expected an integer between 1 and 65535';

const poolMaxError = 'expected an integer between 1 and 100';
const databaseUrlError = 'expected a postgres:// or postgresql:// URL';

const isPostgresUrl = (value: string): boolean =>
  URL.canParse(value) && ['postgres:', 'postgresql:'].includes(new URL(value).protocol);

export const logLevels = ['trace', 'debug', 'info', 'warning', 'error', 'fatal'] as const;
export const logFormats = ['json', 'pretty'] as const;

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'], {
      error: 'expected one of development, test, production',
    })
    .default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce
    .number({ error: portError })
    .int({ error: portError })
    .min(1, { error: portError })
    .max(65_535, { error: portError })
    .default(3000),
  LOG_LEVEL: z
    .enum(logLevels, { error: `expected one of ${logLevels.join(', ')}` })
    .default('info'),
  LOG_FORMAT: z
    .enum(logFormats, { error: `expected one of ${logFormats.join(', ')}` })
    .default('json'),
  DATABASE_URL: required.refine(isPostgresUrl, { error: databaseUrlError }),
  DATABASE_POOL_MAX: z.coerce
    .number({ error: poolMaxError })
    .int({ error: poolMaxError })
    .min(1, { error: poolMaxError })
    .max(100, { error: poolMaxError })
    .default(10),
  PROGRAM_NAME: required,
  ORG_NAME: required,
});

const envKeys = EnvSchema.keyof().options;
type EnvKey = (typeof envKeys)[number];

export type Config = Readonly<{
  env: 'development' | 'test' | 'production';
  server: Readonly<{ host: string; port: number }>;
  log: LogConfig;
  db: DbConfig;
  branding: Readonly<{ programName: string; orgName: string }>;
}>;

export type LogConfig = Readonly<{
  level: (typeof logLevels)[number];
  format: (typeof logFormats)[number];
}>;

/** `url` contains credentials: never log or print it. */
export type DbConfig = Readonly<{ url: string; poolMax: number }>;

export type ConfigIssue = Readonly<{ key: string; message: string }>;

/** Lists invalid variables by name only — never their values, which may be secrets. */
export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    super(
      [
        'Invalid configuration:',
        ...issues.map(({ key, message }) => `  - ${key}: ${message}`),
      ].join('\n'),
    );
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/** Picks the known keys, trims them, and treats blank values as missing. */
const normalise = (env: NodeJS.ProcessEnv): Partial<Record<EnvKey, string>> =>
  Object.fromEntries(
    envKeys.flatMap((key) => {
      const value = env[key]?.trim();
      return value ? [[key, value]] : [];
    }),
  );

export const loadConfig = (env: NodeJS.ProcessEnv): Config => {
  const result = EnvSchema.safeParse(normalise(env));
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => ({
        key: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const {
    NODE_ENV,
    HOST,
    PORT,
    LOG_LEVEL,
    LOG_FORMAT,
    DATABASE_URL,
    DATABASE_POOL_MAX,
    PROGRAM_NAME,
    ORG_NAME,
  } = result.data;
  return Object.freeze({
    env: NODE_ENV,
    server: Object.freeze({ host: HOST, port: PORT }),
    log: Object.freeze({ level: LOG_LEVEL, format: LOG_FORMAT }),
    db: Object.freeze({ url: DATABASE_URL, poolMax: DATABASE_POOL_MAX }),
    branding: Object.freeze({ programName: PROGRAM_NAME, orgName: ORG_NAME }),
  });
};
