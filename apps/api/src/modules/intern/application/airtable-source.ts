/** Where to read interns from, given per import (the token is typed in and never stored). */
export type AirtableSourceInput = Readonly<{
  token: string;
  baseId: string;
  tableId: string;
  /** A view id (`viw…`) or its name. */
  view: string;
}>;

/** One record as Airtable gives it; what the fields mean is the mapping's job (8.2). */
export type AirtableRecord = Readonly<{
  id: string;
  createdTime: string;
  fields: Readonly<Record<string, unknown>>;
}>;

export const airtableErrorReasons = [
  'unauthorized',
  'forbidden',
  'not_found',
  'view_not_found',
  'rate_limited',
  'too_many_records',
  'timeout',
  'unexpected',
] as const;
export type AirtableErrorReason = (typeof airtableErrorReasons)[number];

/** Why reading from Airtable failed. Never carries the token, nor any field's value. */
export class AirtableError extends Error {
  readonly reason: AirtableErrorReason;
  /** Airtable's own error type and message, when it gave them (e.g. `INVALID_PERMISSIONS`). */
  readonly airtableType: string | null;
  readonly airtableMessage: string | null;

  constructor(
    reason: AirtableErrorReason,
    message: string,
    airtable: Readonly<{
      type?: string | null | undefined;
      message?: string | null | undefined;
    }> = {},
  ) {
    super(message);
    this.name = 'AirtableError';
    this.reason = reason;
    this.airtableType = airtable.type ?? null;
    this.airtableMessage = airtable.message ?? null;
  }
}

/** Reads every record of a table's view (TECH_STACK: Airtable's REST API). */
export type AirtableSource = Readonly<{
  fetchRecords: (input: AirtableSourceInput) => Promise<readonly AirtableRecord[]>;
}>;
