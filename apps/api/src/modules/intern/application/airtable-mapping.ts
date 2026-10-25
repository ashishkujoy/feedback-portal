import {
  CreateInternRequest,
  type FieldMapping,
  type ImportColumns,
  type MappedField,
  mappedFields,
} from '@feedback-portal/contracts';
import type { DetailsInput } from '../domain/intern.ts';
import type { AirtableRecord } from './airtable-source.ts';

/**
 * The columns each intern field starts from when a batch has no saved mapping (8.6): the first
 * the view has wins, matching ignoring case, spaces and apostrophes. Without a username column,
 * the username comes from the email.
 */
export const defaultColumns: Readonly<Record<MappedField, readonly string[]>> = {
  username: ['Username'],
  name: ['Full name', 'Name'],
  email: ['Email', 'Email ID'],
  phone: ['Phone', 'Phone number', 'Mobile Number'],
  diplomaBranch: ['Diploma branch'],
  parentNames: ["Parents' names", 'Parent names', 'Parents names'],
  interviewNotes: ['Interview notes'],
};

const labels: Readonly<Record<MappedField, string>> = {
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

/** The view's column named `name`, ignoring case, spaces and apostrophes. */
const columnLike = (columns: readonly string[], name: string): string | undefined =>
  columns.find((column) => comparable(column) === comparable(name));

/**
 * The view's columns, in the order first seen. Airtable leaves empty cells out of a record, so a
 * column appears once any record has a value in it.
 */
export const viewColumns = (records: readonly AirtableRecord[]): string[] => [
  ...new Set(records.flatMap((record) => Object.keys(record.fields))),
];

type StartingMapping = ImportColumns['mapping'];

/**
 * The mapping the Fields step starts from (8.6): `saved` where the view still has its columns
 * (the others listed as missing), or else the defaults.
 */
export const startingMapping = (
  columns: readonly string[],
  saved: FieldMapping | null,
): Pick<ImportColumns, 'mapping' | 'missing'> => {
  if (!saved) {
    const suggest = (field: MappedField): string | null =>
      defaultColumns[field]
        .map((name) => columnLike(columns, name))
        .find((found) => found !== undefined) ?? null;
    const username = suggest('username');
    return {
      mapping: {
        username: username ? { kind: 'column', column: username } : { kind: 'fromEmail' },
        name: suggest('name'),
        email: suggest('email'),
        phone: suggest('phone'),
        diplomaBranch: suggest('diplomaBranch'),
        parentNames: suggest('parentNames'),
        interviewNotes: suggest('interviewNotes'),
      },
      missing: [],
    };
  }
  const missing: ImportColumns['missing'][number][] = [];
  const keep = (field: MappedField, column: string | null): string | null => {
    if (column === null) return null;
    const found = columnLike(columns, column);
    if (found === undefined) missing.push({ field, column });
    return found ?? null;
  };
  const username = saved.username;
  const usernameColumn = username.kind === 'column' ? keep('username', username.column) : null;
  const mapping: StartingMapping = {
    username:
      username.kind === 'fromEmail'
        ? username
        : usernameColumn
          ? { kind: 'column', column: usernameColumn }
          : null,
    name: keep('name', saved.name),
    email: keep('email', saved.email),
    phone: keep('phone', saved.phone),
    diplomaBranch: keep('diplomaBranch', saved.diplomaBranch),
    parentNames: keep('parentNames', saved.parentNames),
    interviewNotes: keep('interviewNotes', saved.interviewNotes),
  };
  return { mapping, missing };
};

/** The mapping's columns, in field order (the username's only when it is one). */
const mappedColumns = (mapping: FieldMapping): string[] =>
  mappedFields.flatMap((field) => {
    if (field === 'username') {
      return mapping.username.kind === 'column' ? [mapping.username.column] : [];
    }
    const column = mapping[field];
    return column === null ? [] : [column];
  });

/** Columns the mapping names that the view doesn't have (exactly as the view spells them). */
export const unknownColumns = (
  mapping: FieldMapping,
  columns: readonly string[],
): readonly string[] => mappedColumns(mapping).filter((column) => !columns.includes(column));

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

/** The part of an email before the @, for a username taken from it; nothing without an @. */
const beforeAt = (email: string | undefined): string | undefined => {
  const at = email?.trim().indexOf('@') ?? -1;
  return email && at > 0 ? email.trim().slice(0, at) : undefined;
};

const sentence = (message: string): string => (message.endsWith('.') ? message : `${message}.`);

/**
 * Turns Airtable's records into interns to import through the batch's mapping (8.6), or invalid
 * rows with every reason, by the same rules as Add intern (7.3). A username taken from the email
 * follows the same rules. A username used by an earlier row makes the later one invalid.
 */
export const mapRecords = (
  records: readonly AirtableRecord[],
  mapping: FieldMapping,
): MappedRecords => {
  const valid: MappedRow[] = [];
  const invalid: InvalidRow[] = [];
  const firstRowOf = new Map<string, number>();

  records.forEach((record, index) => {
    const row = index + 1;
    const reasons: string[] = [];
    const cells: Partial<Record<MappedField, string>> = {};
    for (const field of mappedFields) {
      const column =
        field === 'username'
          ? mapping.username.kind === 'column'
            ? mapping.username.column
            : null
          : mapping[field];
      const text = column === null ? undefined : asText(record.fields[column]);
      if (text === null) reasons.push(`${labels[field]} isn't text.`);
      else if (text !== undefined) cells[field] = text;
    }
    if (mapping.username.kind === 'fromEmail') {
      const derived = beforeAt(cells.email);
      if (derived !== undefined) cells.username = derived;
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
