import { CreateInternRequest } from '@feedback-portal/contracts';
import type { DetailsInput } from '../domain/intern.ts';
import type { AirtableRecord } from './airtable-source.ts';

type DetailKey = keyof Required<DetailsInput>;

/**
 * Which Airtable columns fill which intern field. Names match ignoring case, spaces and
 * apostrophes; when a record has several, the first listed wins. Your table's names go here.
 */
export const columns: Readonly<Record<DetailKey, readonly string[]>> = {
  username: ['Username'],
  name: ['Full name', 'Name'],
  email: ['Email'],
  phone: ['Phone', 'Phone number'],
  diplomaBranch: ['Diploma branch'],
  parentNames: ["Parents' names", 'Parent names', 'Parents names'],
  interviewNotes: ['Interview notes'],
};

const labels: Readonly<Record<DetailKey, string>> = {
  username: 'Username',
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  diplomaBranch: 'Diploma branch',
  parentNames: "Parents' names",
  interviewNotes: 'Interview notes',
};

/** A row ready to import: Airtable's record id, the normalised details and the raw snapshot. */
export type MappedRow = Readonly<{
  /** The position in the view, from 1. */
  row: number;
  recordId: string;
  details: DetailsInput;
  airtableFields: Readonly<Record<string, unknown>>;
}>;

/** A row that can't be imported, and why (v2 A10's "Invalid rows"). */
export type InvalidRow = Readonly<{
  row: number;
  recordId: string;
  /** As Airtable has it, when there is one. */
  username: string | null;
  reasons: readonly string[];
}>;

export type MappedRecords = Readonly<{
  valid: readonly MappedRow[];
  invalid: readonly InvalidRow[];
}>;

const comparable = (name: string): string => name.toLowerCase().replaceAll(/[\s'’]/g, '');

const isText = (value: unknown): value is string => typeof value === 'string';

/**
 * A cell as text: text as is, a number written out, a list of text joined with ", ". `undefined`
 * for an empty cell; `null` for anything that isn't text (attachments, collaborators, checkboxes).
 */
const asText = (value: unknown): string | null | undefined => {
  if (value === undefined || value === null) return undefined;
  if (isText(value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value) && value.every(isText)) return value.join(', ');
  return null;
};

/** The first of the field's columns that the record has (empty cells are left out by Airtable). */
const cellFor = (fields: Readonly<Record<string, unknown>>, key: DetailKey): unknown => {
  const byName = new Map(Object.keys(fields).map((name) => [comparable(name), name]));
  for (const column of columns[key]) {
    const name = byName.get(comparable(column));
    if (name !== undefined) return fields[name];
  }
  return undefined;
};

const sentence = (message: string): string => (message.endsWith('.') ? message : `${message}.`);

const detailKeys: readonly DetailKey[] = [
  'username',
  'name',
  'email',
  'phone',
  'diplomaBranch',
  'parentNames',
  'interviewNotes',
];

/**
 * Turns Airtable's records into interns to import, or invalid rows with every reason, by the
 * same rules as Add intern (7.3). A username used by an earlier row makes the later one invalid.
 */
export const mapRecords = (records: readonly AirtableRecord[]): MappedRecords => {
  const valid: MappedRow[] = [];
  const invalid: InvalidRow[] = [];
  const firstRowOf = new Map<string, number>();

  records.forEach((record, index) => {
    const row = index + 1;
    const reasons: string[] = [];
    const cells: Partial<Record<DetailKey, string>> = {};
    for (const key of detailKeys) {
      const text = asText(cellFor(record.fields, key));
      if (text === null) reasons.push(`${labels[key]} isn't text.`);
      else if (text !== undefined) cells[key] = text;
    }
    const rawUsername = cells.username?.trim() || null;
    const parsed = CreateInternRequest.safeParse({
      username: cells.username ?? '',
      name: cells.name ?? '',
      email: cells.email ?? '',
      phone: cells.phone ?? null,
      diplomaBranch: cells.diplomaBranch ?? null,
      parentNames: cells.parentNames ?? null,
      interviewNotes: cells.interviewNotes ?? null,
    });
    if (!parsed.success) {
      reasons.push(...parsed.error.issues.map((issue) => sentence(issue.message)));
      invalid.push({ row, recordId: record.id, username: rawUsername, reasons });
      return;
    }
    const earlier = firstRowOf.get(parsed.data.username);
    if (earlier !== undefined) reasons.push(`Username is used by row ${earlier}.`);
    if (reasons.length > 0) {
      invalid.push({ row, recordId: record.id, username: rawUsername, reasons });
      return;
    }
    // Only rows that will be imported claim their username.
    firstRowOf.set(parsed.data.username, row);
    valid.push({ row, recordId: record.id, details: parsed.data, airtableFields: record.fields });
  });

  return { valid, invalid };
};
