import { describe, expect, it } from 'vitest';
import type { AirtableRecord } from './airtable-source.ts';
import type { FieldMapping } from '@feedback-portal/contracts';
import { mapRecords } from './airtable-mapping.ts';
import { type ExistingIntern, previewImport } from './import-preview.ts';

let n = 0;
const record = (username: string, extra: Record<string, unknown> = {}): AirtableRecord => {
  n += 1;
  return {
    id: `rec${String(n).padStart(14, '0')}`,
    createdTime: '2026-06-02T08:15:00.000Z',
    fields: { Username: username, 'Full name': `Name ${n}`, Email: `${n}@example.com`, ...extra },
  };
};

const mapping: FieldMapping = {
  username: { kind: 'column', column: 'Username' },
  name: 'Full name',
  email: 'Email',
  phone: null,
  diplomaBranch: null,
  parentNames: null,
  interviewNotes: null,
};

const mapped = (records: readonly AirtableRecord[]) => mapRecords(records, mapping);

const existing = (
  username: string,
  status: ExistingIntern['status'] = 'active',
  airtableRecordId: string | null = null,
): ExistingIntern => ({
  id: `01890a5d-ac96-774b-bcce-b30209${String(username.length).padStart(6, '0')}`,
  username,
  status,
  airtableRecordId,
});

describe('previewImport', () => {
  it('sorts rows into new and updated by username, ignoring case', () => {
    // Stored mixed-case (as data from before 7.3 lower-casing could be).
    const records = [record('ishita.rao'), record('zoya.ansari'), record('kabir.nair')];
    const ishita = existing('Ishita.Rao');

    const preview = previewImport(mapped(records), [ishita], records.length);

    expect(preview.counts).toEqual({ new: 2, updated: 1, invalid: 0 });
    expect(preview.updated).toEqual([
      { row: 1, username: 'ishita.rao', name: expect.any(String), internId: ishita.id },
    ]);
    expect(preview.new.map((row) => [row.row, row.username])).toEqual([
      [2, 'zoya.ansari'],
      [3, 'kabir.nair'],
    ]);
    expect(preview.recordCount).toBe(3);
  });

  it('refuses rows matching a read-only intern, saying how they left', () => {
    const records = [
      record('meera.pillai'),
      record('kabir.nair'),
      record('dev.bhat'),
      record('aarav.sharma'),
    ];

    const preview = previewImport(
      mapped(records),
      [
        existing('meera.pillai', 'graduated'),
        existing('kabir.nair', 'terminated'),
        existing('dev.bhat', 'withdrawn'),
        existing('aarav.sharma', 'on_notice'),
      ],
      records.length,
    );

    expect(preview.invalid).toEqual([
      {
        row: 1,
        username: 'meera.pillai',
        reasons: ['meera.pillai has graduated, so their record is read-only.'],
      },
      {
        row: 2,
        username: 'kabir.nair',
        reasons: ['kabir.nair was terminated, so their record is read-only.'],
      },
      {
        row: 3,
        username: 'dev.bhat',
        reasons: ['dev.bhat withdrew, so their record is read-only.'],
      },
    ]);
    // On notice can still change.
    expect(preview.updated.map((row) => row.username)).toEqual(['aarav.sharma']);
    expect(preview.counts).toEqual({ new: 0, updated: 1, invalid: 3 });
  });

  it("passes 8.2's invalid rows through, in row order", () => {
    const records = [
      record('ishita.rao'),
      record('', {}),
      record('ishita.rao'),
      record('zoya', { Email: 'nope' }),
    ];

    const preview = previewImport(mapped(records), [], records.length);

    expect(preview.invalid.map(({ row, reasons }) => [row, reasons])).toEqual([
      [2, ['Username is required.']],
      [3, ['Username is used by row 1.']],
      [4, ['Invalid email address.']],
    ]);
    expect(preview.counts).toEqual({ new: 1, updated: 0, invalid: 3 });
  });

  it('is empty for an empty view', () => {
    expect(previewImport(mapped([]), [existing('ishita.rao')], 0)).toEqual({
      recordCount: 0,
      counts: { new: 0, updated: 0, invalid: 0 },
      new: [],
      updated: [],
      invalid: [],
    });
  });

  it('matches the intern imported from the same record first, keeping its username', () => {
    // The email, and so the username, changed in Airtable since the last import.
    const moved = record('ishita.rao2');
    const ishita = existing('ishita.rao', 'active', moved.id);

    const preview = previewImport(mapped([moved]), [ishita], 1);

    expect(preview.updated).toEqual([
      { row: 1, username: 'ishita.rao', name: expect.any(String), internId: ishita.id },
    ]);
    expect(preview.counts).toEqual({ new: 0, updated: 1, invalid: 0 });
  });

  it('claims an intern added by hand with the same username', () => {
    const preview = previewImport(mapped([record('zoya.ansari')]), [existing('zoya.ansari')], 1);

    expect(preview.counts).toEqual({ new: 0, updated: 1, invalid: 0 });
  });

  it("doesn't take over an intern imported from another record", () => {
    const preview = previewImport(
      mapped([record('ravi')]),
      [existing('ravi', 'active', 'recOTHERRECORD0001')],
      1,
    );

    expect(preview.invalid).toEqual([
      { row: 1, username: 'ravi', reasons: ['ravi belongs to another Airtable record.'] },
    ]);
    expect(preview.counts).toEqual({ new: 0, updated: 0, invalid: 1 });
  });
});
