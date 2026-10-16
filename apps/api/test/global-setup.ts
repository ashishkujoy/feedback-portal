import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { createDb } from '../src/shared/db/client.ts';
import { runMigrations } from '../src/shared/db/migrate.ts';
import { postgresImage, templateDatabase, withDatabase } from './postgres.ts';

let container: StartedPostgreSqlContainer | undefined;

/** Starts Postgres once per run and migrates the template database every test file clones. */
export const setup = async (project: TestProject): Promise<void> => {
  container = await new PostgreSqlContainer(postgresImage).withDatabase(templateDatabase).start();

  const template = createDb({ url: container.getConnectionUri(), poolMax: 1 });
  try {
    await runMigrations(template.db);
  } finally {
    // CREATE DATABASE … TEMPLATE fails while anyone is connected to the template.
    await template.close();
  }

  project.provide('pgAdminUrl', withDatabase(container.getConnectionUri(), 'postgres'));
};

export const teardown = async (): Promise<void> => {
  await container?.stop();
};
