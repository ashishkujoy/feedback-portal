import { getLogger, type LogRecord, reset } from '@logtape/logtape';
import { afterEach, describe, expect, it } from 'vitest';
import { configureLogging } from './logging.ts';

describe('configureLogging', () => {
  afterEach(async () => {
    await reset();
  });

  it('drops records below the configured level', async () => {
    const records: LogRecord[] = [];
    await configureLogging({ level: 'warning', format: 'json' }, (record) => records.push(record));
    const logger = getLogger(['api', 'test']);

    logger.info('hidden');
    logger.warn('shown');

    expect(records.map((r) => [r.level, r.category, r.rawMessage])).toEqual([
      ['warning', ['api', 'test'], 'shown'],
    ]);
  });

  it('ignores loggers outside the api category', async () => {
    const records: LogRecord[] = [];
    await configureLogging({ level: 'trace', format: 'json' }, (record) => records.push(record));

    getLogger(['other']).error('not ours');

    expect(records).toEqual([]);
  });
});
