import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FieldMapping } from '@feedback-portal/contracts';
import { mapRecords, startingMapping, unknownColumns, viewColumns } from './airtable-mapping.ts';
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

/** The fixtures' columns, as 8.2 named them. */
const mapping: FieldMapping = {
  username: { kind: 'column', column: 'Username' },
  name: 'Full name',
  email: 'Email',
  phone: 'Phone',
  diplomaBranch: 'Diploma branch',
  parentNames: "Parents' names",
  interviewNotes: 'Interview notes',
};

/** The real view's columns (8.6), with no username column. */
const realColumns: FieldMapping = {
  username: { kind: 'fromEmail' },
  name: 'Name',
  email: 'Email ID',
  phone: 'Mobile Number',
  diplomaBranch: 'Diploma Branch',
  parentNames: null,
  interviewNotes: null,
};

describe('mapRecords', () => {
  it("maps 8.1's recorded pages to interns, keeping the raw record", () => {
    const records = [...fixture('page-1'), ...fixture('page-2')];

    const { valid, invalid } = mapRecords(records, mapping);

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

  it('writes numbers and lists of text as text, and treats blanks as empty', () => {
    const [row] = mapRecords(
      [
        record({
          ...ishita,
          Phone: 9_845_012_345,
          "Parents' names": ['Ramesh Rao', 'Kavitha Rao'],
          'Diploma branch': '   ',
        }),
      ],
      mapping,
    ).valid;

    expect(row?.details).toMatchObject({
      phone: '9845012345',
      parentNames: 'Ramesh Rao, Kavitha Rao',
      diplomaBranch: null,
    });
  });

  it("refuses values that aren't text", () => {
    const { valid, invalid } = mapRecords(
      [
        record({
          ...ishita,
          Phone: [{ id: 'att1', url: 'https://dl.airtable.test/x.png' }],
          'Diploma branch': { id: 'usr1', email: 'someone@example.com' },
          'Interview notes': true,
        }),
      ],
      mapping,
    );

    expect(valid).toEqual([]);
    expect(invalid[0]?.reasons).toEqual([
      "Phone isn't text.",
      "Diploma branch isn't text.",
      "Interview notes isn't text.",
    ]);
  });

  it('lists every reason a row breaks the rules, with its username when there is one', () => {
    const { invalid } = mapRecords(
      [
        record({ 'Full name': 'No Username', Email: 'nope' }),
        record({ Username: `@${'x'.repeat(51)}`, 'Full name': '   ', Email: 'ok@example.com' }),
        record({ Username: 'no.email', 'Full name': 'No Email' }),
      ],
      mapping,
    );

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
      // A missing email is asked for, not called invalid (8.6).
      {
        row: 3,
        recordId: expect.any(String),
        username: 'no.email',
        reasons: ['Email is required.'],
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

    const { valid, invalid } = mapRecords(rows, mapping);

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
    expect(mapRecords([], mapping)).toEqual({ valid: [], invalid: [] });
  });

  it('reads only the mapped columns, leaving unmapped fields empty', () => {
    const [row] = mapRecords([record({ ...ishita, Phone: '+91 1', 'Interview notes': 'Notes' })], {
      ...mapping,
      phone: null,
      interviewNotes: null,
    }).valid;

    expect(row?.details).toMatchObject({ phone: null, interviewNotes: null });
  });

  it('takes the username from the email when the view has no username column', () => {
    const { valid, invalid } = mapRecords(
      [
        record({
          Name: 'Vikram Rao',
          'Email ID': ' Vikram.Rao63@Example.com ',
          'Mobile Number': '98450',
        }),
        record({ Name: 'Plus Sign', 'Email ID': 'plus+tag@example.com' }),
        record({ Name: 'No Email' }),
      ],
      realColumns,
    );

    expect(valid.map((row) => row.details)).toEqual([
      {
        username: 'vikram.rao63',
        name: 'Vikram Rao',
        email: 'vikram.rao63@example.com',
        phone: '98450',
        diplomaBranch: null,
        parentNames: null,
        interviewNotes: null,
      },
    ]);
    // A derived username follows the same rules as a typed one.
    expect(invalid.map(({ row, username, reasons }) => [row, username, reasons])).toEqual([
      [2, 'plus+tag', ['Username can only contain letters, digits, ".", "_" and "-".']],
      [3, null, ['Username is required.', 'Email is required.']],
    ]);
  });
});

describe('the view and its mapping', () => {
  it('lists the columns as first seen across records', () => {
    expect(
      viewColumns([
        record({ Name: 'A', 'Email ID': 'a@x.test' }),
        record({ Name: 'B', Batch: 'Afternoon' }),
      ]),
    ).toEqual(['Name', 'Email ID', 'Batch']);
  });

  it('starts from the defaults: the first default the view has, ignoring case and spaces', () => {
    const columns = [
      'Name',
      'Email ID',
      'Whatsapp number',
      'Mobile Number',
      'Diploma Branch',
      'Batch',
    ];
    expect(startingMapping(columns, null)).toEqual({ mapping: realColumns, missing: [] });
    expect(
      startingMapping(['USERNAME', 'full name', 'Name', 'EMAIL', 'PARENTS NAMES'], null).mapping,
    ).toMatchObject({
      username: { kind: 'column', column: 'USERNAME' },
      name: 'full name',
      email: 'EMAIL',
      parentNames: 'PARENTS NAMES',
      phone: null,
    });
  });

  it('starts from a saved mapping, naming saved columns the view no longer has', () => {
    const saved: FieldMapping = { ...realColumns, phone: 'Phone', diplomaBranch: 'diploma branch' };
    expect(startingMapping(['Name', 'Email ID', 'Diploma Branch'], saved)).toEqual({
      mapping: { ...realColumns, phone: null, diplomaBranch: 'Diploma Branch' },
      missing: [{ field: 'phone', column: 'Phone' }],
    });
    expect(
      startingMapping(['Name'], { ...mapping, parentNames: null, interviewNotes: null }),
    ).toMatchObject({
      mapping: { username: null, name: null, email: null },
      missing: [
        { field: 'username', column: 'Username' },
        { field: 'name', column: 'Full name' },
        { field: 'email', column: 'Email' },
        { field: 'phone', column: 'Phone' },
        { field: 'diplomaBranch', column: 'Diploma branch' },
      ],
    });
  });

  it('finds mapped columns the view lacks', () => {
    expect(unknownColumns(realColumns, ['Name', 'Email ID', 'Mobile Number'])).toEqual([
      'Diploma Branch',
    ]);
    expect(unknownColumns(mapping, viewColumns(fixture('page-1')))).toEqual([]);
  });
});
