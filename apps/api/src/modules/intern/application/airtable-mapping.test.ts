import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapRecords } from './airtable-mapping.ts';
import type { AirtableRecord } from './airtable-source.ts';

const fixture = (name: string): readonly AirtableRecord[] => {
  const page: { records: AirtableRecord[] } = JSON.parse(
    readFileSync(
      new URL(`../../../../test/fixtures/airtable/${name}.json`, import.meta.url),
      'utf8',
    ),
  );
  return page.records;
};

let n = 0;
const record = (fields: Record<string, unknown>): AirtableRecord => {
  n += 1;
  return {
    id: `rec${String(n).padStart(14, '0')}`,
    createdTime: '2026-06-02T08:15:00.000Z',
    fields,
  };
};

const ishita = { Username: 'ishita.rao', 'Full name': 'Ishita Rao', Email: 'ishita@example.com' };

describe('mapRecords', () => {
  it("maps 8.1's recorded pages to interns, keeping the raw record", () => {
    const records = [...fixture('page-1'), ...fixture('page-2')];

    const { valid, invalid } = mapRecords(records);

    expect(invalid).toEqual([]);
    expect(valid.map(({ row, recordId, details }) => [row, recordId, details.username])).toEqual([
      [1, 'recA1b2C3d4E5f6G7', 'ishita.rao'],
      [2, 'recB2c3D4e5F6g7H8', 'zoya.ansari'],
      [3, 'recC3d4E5f6G7h8I9', 'kabir.nair'],
    ]);
    expect(valid[0]?.details).toEqual({
      username: 'ishita.rao',
      name: 'Ishita Rao',
      email: 'ishita.rao@example.com',
      phone: '+91 98450 12345',
      diplomaBranch: 'Computer Engineering',
      parentNames: 'Ramesh Rao, Kavitha Rao',
      interviewNotes: '### Technical round\n- Solved the string-compression problem tests first',
    });
    expect(valid[0]?.airtableFields).toBe(records[0]?.fields);
    expect(valid[0]?.airtableFields).toMatchObject({ 'Interview score': 8 });
    expect(valid[1]?.details).toMatchObject({ phone: null, parentNames: null });
  });

  it('matches column names ignoring case, spaces and apostrophes, the first listed winning', () => {
    const [row] = mapRecords([
      record({
        USERNAME: 'ishita.rao',
        name: 'Second Choice',
        'full name': 'Ishita Rao',
        EMAIL: 'ishita@example.com',
        'PARENTS NAMES': 'Ramesh Rao',
        'phone number': '+91 1',
      }),
    ]).valid;

    expect(row?.details).toMatchObject({
      name: 'Ishita Rao',
      parentNames: 'Ramesh Rao',
      phone: '+91 1',
    });
  });

  it('writes numbers and lists of text as text, and treats blanks as empty', () => {
    const [row] = mapRecords([
      record({
        ...ishita,
        Phone: 9_845_012_345,
        "Parents' names": ['Ramesh Rao', 'Kavitha Rao'],
        'Diploma branch': '   ',
      }),
    ]).valid;

    expect(row?.details).toMatchObject({
      phone: '9845012345',
      parentNames: 'Ramesh Rao, Kavitha Rao',
      diplomaBranch: null,
    });
  });

  it("refuses values that aren't text", () => {
    const { valid, invalid } = mapRecords([
      record({
        ...ishita,
        Phone: [{ id: 'att1', url: 'https://dl.airtable.test/x.png' }],
        'Diploma branch': { id: 'usr1', email: 'someone@example.com' },
        'Interview notes': true,
      }),
    ]);

    expect(valid).toEqual([]);
    expect(invalid[0]?.reasons).toEqual([
      "Phone isn't text.",
      "Diploma branch isn't text.",
      "Interview notes isn't text.",
    ]);
  });

  it('lists every reason a row breaks the rules, with its username when there is one', () => {
    const { invalid } = mapRecords([
      record({ 'Full name': 'No Username', Email: 'nope' }),
      record({ Username: `@${'x'.repeat(51)}`, 'Full name': '   ', Email: 'ok@example.com' }),
    ]);

    expect(invalid).toEqual([
      {
        row: 1,
        recordId: expect.any(String),
        username: null,
        reasons: ['Username is required.', 'Invalid email address.'],
      },
      {
        row: 2,
        recordId: expect.any(String),
        username: `@${'x'.repeat(51)}`,
        reasons: ['Username must be at most 50 characters.', 'Name is required.'],
      },
    ]);
  });

  it('takes a username once per import, ignoring case; later rows are invalid', () => {
    const rows = [
      record({ ...ishita, Username: 'kabir.nair' }),
      record({ ...ishita, Username: 'zoya.ansari' }),
      record({ ...ishita, Username: 'dev.bhat', Email: 'nope' }),
      record({ ...ishita, Username: 'dev.bhat' }),
      record({ ...ishita, Username: '@ZOYA.Ansari' }),
    ];

    const { valid, invalid } = mapRecords(rows);

    expect(valid.map((row) => [row.row, row.details.username])).toEqual([
      [1, 'kabir.nair'],
      [2, 'zoya.ansari'],
      // Row 3 was invalid, so it doesn't take "dev.bhat" from row 4.
      [4, 'dev.bhat'],
    ]);
    expect(invalid.map(({ row, username, reasons }) => [row, username, reasons])).toEqual([
      [3, 'dev.bhat', ['Invalid email address.']],
      [5, '@ZOYA.Ansari', ['Username is used by row 2.']],
    ]);
  });

  it('gives nothing for an empty view', () => {
    expect(mapRecords([])).toEqual({ valid: [], invalid: [] });
  });
});
