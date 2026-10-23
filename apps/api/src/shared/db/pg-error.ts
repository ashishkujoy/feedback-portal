/** The SQLSTATE and constraint of a failed query; Drizzle wraps the driver error in `cause`. */
export type PgErrorInfo = Readonly<{ code: string; constraint: string | undefined }>;

const fieldOf = (value: object, key: string): unknown =>
  key in value ? Reflect.get(value, key) : undefined;

export const pgErrorOf = (error: unknown): PgErrorInfo | undefined => {
  const candidates = [error, error instanceof Error ? error.cause : undefined];
  for (const candidate of candidates) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const code = fieldOf(candidate, 'code');
    const constraint = fieldOf(candidate, 'constraint');
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) {
      return { code, constraint: typeof constraint === 'string' ? constraint : undefined };
    }
  }
  return undefined;
};

export const pgErrorCodes = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  invalidTextRepresentation: '22P02',
  checkViolation: '23514',
} as const;

export const isUniqueViolation = (error: unknown, constraint: string): boolean => {
  const info = pgErrorOf(error);
  return info?.code === pgErrorCodes.uniqueViolation && info.constraint === constraint;
};
