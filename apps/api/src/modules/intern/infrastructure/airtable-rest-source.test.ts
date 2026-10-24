import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../shared/errors/app-error.ts';
import { AirtableError, type AirtableSourceInput } from '../application/airtable-source.ts';
import { createAirtableRestSource } from './airtable-rest-source.ts';

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`../../../../test/fixtures/airtable/${name}.json`, import.meta.url),
      'utf8',
    ),
  );

const token = 'patSecret0123456789.abcdef';
const input: AirtableSourceInput = {
  token,
  baseId: 'appAbCdEfGh123456',
  tableId: 'tblX9mQ2rLk4vP8zz',
  view: 'Batch 2 – confirmed',
};

const urlOf = (request: Parameters<typeof fetch>[0]): URL =>
  new URL(
    typeof request === 'string' ? request : request instanceof URL ? request.href : request.url,
  );

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

/** A fake Airtable serving pages by their `offset`. */
const serving = (pages: Readonly<Record<string, { status: number; body: unknown }>>) =>
  vi.fn<typeof fetch>((url) => {
    const offset = urlOf(url).searchParams.get('offset') ?? '';
    const page = pages[offset];
    return page ? json(page.status, page.body) : json(500, {});
  });

const source = (fetchFn: typeof fetch, options: { timeoutMs?: number; maxRecords?: number } = {}) =>
  createAirtableRestSource({ apiBaseUrl: 'https://api.airtable.test', fetchFn, ...options });

const errorOf = async (action: Promise<unknown>) => {
  try {
    await action;
  } catch (error) {
    return error;
  }
  throw new Error('expected a failure');
};

describe('the Airtable REST source', () => {
  it('reads every page of the view, in order, with the token as a bearer', async () => {
    const fetchFn = serving({
      '': { status: 200, body: fixture('page-1') },
      'itrPage2/recB2c3D4e5F6g7H8': { status: 200, body: fixture('page-2') },
    });

    const records = await source(fetchFn).fetchRecords(input);

    expect(records.map((record) => record.fields['Username'])).toEqual([
      'Ishita.Rao',
      'zoya.ansari',
      'kabir.nair',
    ]);
    expect(records[0]).toEqual({
      id: 'recA1b2C3d4E5f6G7',
      createdTime: '2026-06-02T08:15:00.000Z',
      fields: expect.objectContaining({ 'Interview score': 8 }),
    });
    const urls = fetchFn.mock.calls.map(([url]) => urlOf(url));
    expect(urls.map((url) => url.pathname)).toEqual([
      '/v0/appAbCdEfGh123456/tblX9mQ2rLk4vP8zz',
      '/v0/appAbCdEfGh123456/tblX9mQ2rLk4vP8zz',
    ]);
    expect(urls.map((url) => Object.fromEntries(url.searchParams))).toEqual([
      { pageSize: '100', view: 'Batch 2 – confirmed' },
      { pageSize: '100', view: 'Batch 2 – confirmed', offset: 'itrPage2/recB2c3D4e5F6g7H8' },
    ]);
    expect(new Headers(fetchFn.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
      `Bearer ${token}`,
    );
  });

  it('gives nothing for an empty view', async () => {
    expect(
      await source(serving({ '': { status: 200, body: fixture('empty') } })).fetchRecords(input),
    ).toEqual([]);
  });

  it('checks the source before asking Airtable', async () => {
    const fetchFn = serving({});

    const error = await errorOf(
      source(fetchFn).fetchRecords({
        token: ' ',
        baseId: 'base1',
        tableId: 'Interns 2026',
        view: '',
      }),
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error instanceof AppError ? error.issues?.map((issue) => issue.path) : []).toEqual([
      'token',
      'baseId',
      'tableId',
      'view',
    ]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ['error-401', 401, 'unauthorized', 'AUTHENTICATION_REQUIRED'],
    ['error-403', 403, 'forbidden', 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND'],
    ['error-404', 404, 'not_found', 'NOT_FOUND'],
    ['error-422', 422, 'view_not_found', 'VIEW_NAME_NOT_FOUND'],
  ])(
    'turns %s into %s, keeping Airtable’s type and never the token',
    async (name, status, reason, type) => {
      const error = await errorOf(
        source(serving({ '': { status, body: fixture(name) } })).fetchRecords(input),
      );

      expect(error).toBeInstanceOf(AirtableError);
      expect(error).toMatchObject({ reason, airtableType: type });
      expect(JSON.stringify(error) + String(error)).not.toContain(token);
    },
  );

  it('asks to wait when Airtable is busy, and calls anything else unexpected', async () => {
    const busy = await errorOf(
      source(serving({ '': { status: 429, body: {} } })).fetchRecords(input),
    );
    const broken = await errorOf(
      source(serving({ '': { status: 503, body: {} } })).fetchRecords(input),
    );
    const offline = await errorOf(
      source(vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')))).fetchRecords(
        input,
      ),
    );

    expect(busy).toMatchObject({
      reason: 'rate_limited',
      message: 'Airtable is busy; try again in 30 seconds',
    });
    expect([broken, offline]).toMatchObject([{ reason: 'unexpected' }, { reason: 'unexpected' }]);
  });

  it('gives up when Airtable takes too long', async () => {
    const hanging = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );

    expect(await errorOf(source(hanging, { timeoutMs: 20 }).fetchRecords(input))).toMatchObject({
      reason: 'timeout',
    });
  });

  it('refuses a view with more records than one import can take', async () => {
    const fetchFn = serving({
      '': { status: 200, body: fixture('page-1') },
      'itrPage2/recB2c3D4e5F6g7H8': { status: 200, body: fixture('page-2') },
    });

    expect(await errorOf(source(fetchFn, { maxRecords: 2 }).fetchRecords(input))).toMatchObject({
      reason: 'too_many_records',
    });
  });

  it('rejects a malformed answer, saying where without showing any value', async () => {
    const error = await errorOf(
      source(serving({ '': { status: 200, body: fixture('malformed') } })).fetchRecords(input),
    );

    expect(error).toMatchObject({ reason: 'unexpected' });
    expect(String(error)).toContain('page 1: records.0.id');
    expect(String(error)).not.toContain('Private Name');
  });
});
