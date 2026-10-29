import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import journal from '../../../drizzle/meta/_journal.json' with { type: 'json' };
import { withDatabase } from '../../../test/postgres.ts';
import { createDb } from './client.ts';
import { runMigrations } from './migrate.ts';

const adminUrl = inject('pgAdminUrl');
// Generated, never user input: safe as an identifier. Empty, unlike the test template's clones.
const name = `migrate_${randomUUID().replaceAll('-', '')}`;

const runAdmin = async (statement: string) => {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
};

beforeAll(async () => {
  await runAdmin(`create database "${name}"`);
});

afterAll(async () => {
  await runAdmin(`drop database if exists "${name}" with (force)`);
});

describe('runMigrations', () => {
  it('applies each migration once when two deploys migrate at the same time', async () => {
    // Two processes' pools of one connection each, as the migrate job uses.
    const first = createDb({ url: withDatabase(adminUrl, name), poolMax: 1 });
    const second = createDb({ url: withDatabase(adminUrl, name), poolMax: 1 });
    try {
      await Promise.all([runMigrations(first.db), runMigrations(second.db)]);
      const { rows } = await first.db.execute<{ n: number }>(
        sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
      );
      expect(rows).toEqual([{ n: journal.entries.length }]);
      // The lock is released: a later deploy migrates (finding nothing to apply).
      await expect(runMigrations(first.db)).resolves.toBeUndefined();
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });
});
