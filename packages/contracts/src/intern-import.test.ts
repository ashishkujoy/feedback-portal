import { describe, expect, it } from 'vitest';
import { ImportPreview, ImportSourceRequest } from './intern-import.ts';

describe('ImportSourceRequest', () => {
  it('trims the source', () => {
    expect(
      ImportSourceRequest.parse({
        token: ' pat123 ',
        baseId: ' appAbCdEfGh123456 ',
        tableId: 'tblX9mQ2rLk4vP8zz',
        view: ' Batch 2 ',
      }),
    ).toEqual({
      token: 'pat123',
      baseId: 'appAbCdEfGh123456',
      tableId: 'tblX9mQ2rLk4vP8zz',
      view: 'Batch 2',
    });
  });

  it('reports every field in the words of v2', () => {
    const result = ImportSourceRequest.safeParse({
      token: '',
      baseId: 'Interns',
      tableId: 'Interns 2026',
      view: ' ',
    });

    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['token', 'Enter an API key'],
      ['baseId', 'Base IDs start with “app”'],
      ['tableId', 'Table IDs start with “tbl”'],
      ['view', 'Enter a view name'],
    ]);
  });
});

describe('ImportPreview', () => {
  it('needs a reason for every invalid row', () => {
    const preview = {
      recordCount: 1,
      counts: { new: 0, updated: 0, invalid: 1 },
      new: [],
      updated: [],
      invalid: [{ row: 1, username: null, reasons: [] }],
    };
    expect(ImportPreview.safeParse(preview).success).toBe(false);
  });
});
