import type { InternStatus } from '@feedback-portal/contracts';
import type { MappedRecords } from './airtable-mapping.ts';

/** An intern already in the batch, as matching needs it. */
export type ExistingIntern = Readonly<{
  id: string;
  username: string;
  status: InternStatus;
  /** The Airtable record it was last imported from; `null` when added by hand. */
  airtableRecordId: string | null;
}>;

type PreviewRow = Readonly<{ row: number; username: string; name: string }>;

export type ImportPreviewView = Readonly<{
  recordCount: number;
  counts: Readonly<{ new: number; updated: number; invalid: number }>;
  new: readonly PreviewRow[];
  updated: readonly (PreviewRow & Readonly<{ internId: string }>)[];
  invalid: readonly Readonly<{
    row: number;
    username: string | null;
    reasons: readonly string[];
  }>[];
}>;

type InvalidRow = ImportPreviewView['invalid'][number];

/** How a read-only intern left, for the reason; `null` while they can still change. */
const departure = (status: InternStatus): string | null => {
  switch (status) {
    case 'graduated':
      return 'has graduated';
    case 'terminated':
      return 'was terminated';
    case 'withdrawn':
      return 'withdrew';
    case 'active':
    case 'on_notice':
      return null;
  }
};

/**
 * What an import would do (v2 A10's preview): new rows, rows matching an intern (every match
 * counts as updated, 8.3 decision 1), and invalid rows. A row matches the intern imported from
 * its Airtable record first, keeping that intern's username; otherwise an intern with its
 * username, unless that intern came from another record (8.6). A match with a read-only intern
 * can't be changed, so it's invalid with the reason (8.3 decision 2).
 */
export const previewImport = (
  mapped: MappedRecords,
  existing: readonly ExistingIntern[],
  recordCount: number,
): ImportPreviewView => {
  // Usernames are stored lower-cased (7.3), as 8.2 normalises them; compared the same way.
  const byUsername = new Map(existing.map((intern) => [intern.username.toLowerCase(), intern]));
  const byRecord = new Map<string, ExistingIntern>();
  for (const intern of existing) {
    if (intern.airtableRecordId !== null) byRecord.set(intern.airtableRecordId, intern);
  }
  const created: PreviewRow[] = [];
  const updated: (PreviewRow & { internId: string })[] = [];
  const invalid: InvalidRow[] = mapped.invalid.map(({ row, username, reasons }) => ({
    row,
    username,
    reasons,
  }));

  for (const { row, recordId, details } of mapped.valid) {
    const sameRecord = byRecord.get(recordId);
    const sameUsername = byUsername.get(details.username.toLowerCase());
    if (!sameRecord && sameUsername && sameUsername.airtableRecordId !== null) {
      invalid.push({
        row,
        username: details.username,
        reasons: [`${details.username} belongs to another Airtable record.`],
      });
      continue;
    }
    const match = sameRecord ?? sameUsername;
    const username = (match?.username ?? details.username).toLowerCase();
    const summary = { row, username, name: details.name };
    if (!match) {
      created.push(summary);
      continue;
    }
    const left = departure(match.status);
    if (left)
      invalid.push({
        row,
        username,
        reasons: [`${username} ${left}, so their record is read-only.`],
      });
    else updated.push({ ...summary, internId: match.id });
  }

  const invalidRows = invalid.toSorted((a, b) => a.row - b.row);
  return {
    recordCount,
    counts: { new: created.length, updated: updated.length, invalid: invalidRows.length },
    new: created,
    updated,
    invalid: invalidRows,
  };
};
