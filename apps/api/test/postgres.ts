/** Same image as docker-compose.yml, so tests run against the version we deploy. */
export const postgresImage = 'postgres:18.6-alpine';

/** Migrated once per run; every test file's database is cloned from it. */
export const templateDatabase = 'template_app';

/** Returns `url` pointing at another database on the same server. */
export const withDatabase = (url: string, database: string): string => {
  const next = new URL(url);
  next.pathname = `/${database}`;
  return next.toString();
};
