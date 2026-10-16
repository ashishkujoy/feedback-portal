import { getLogger, type LogRecord, reset } from '@logtape/logtape';
import { afterEach, describe, expect, it } from 'vitest';
import { configureLogging, otelCategory } from './logging.ts';

/** Configures logging with capturing main and OTel sinks. */
const configureBoth = async () => {
  const main: LogRecord[] = [];
  const otel: LogRecord[] = [];
  await configureLogging(
    { level: 'info', format: 'json' },
    (record) => main.push(record),
    (record) => otel.push(record),
  );
  return { main, otel };
};

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

  describe('with an OTel sink', () => {
    it('sends api records to both sinks', async () => {
      const { main, otel } = await configureBoth();

      getLogger(['api', 'http']).info('request');

      expect(main.map((r) => r.rawMessage)).toEqual(['request']);
      expect(otel.map((r) => r.rawMessage)).toEqual(['request']);
    });

    it('keeps the SDK diagnostics (api.otel) on stdout only', async () => {
      const { main, otel } = await configureBoth();

      getLogger([...otelCategory]).warn('export failed');

      expect(main.map((r) => r.rawMessage)).toEqual(['export failed']);
      expect(otel).toEqual([]);
    });
  });
});
