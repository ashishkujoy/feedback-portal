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

/** What the person should know, after Airtable's own type (v2 A10-sourceerrors). */
const sentences: Readonly<Record<AirtableErrorReason, string>> = {
  unauthorized: "This key isn't valid.",
  forbidden: "This key can't read the base.",
  not_found: "The base or table wasn't found.",
  view_not_found: "The view wasn't found in the table.",
  too_many_records: 'The view has more records than one import can take (2,000).',
  rate_limited: 'Airtable is busy; try again in 30 seconds.',
  timeout: "Airtable didn't answer in time; try again.",
  unexpected: 'Airtable gave an unexpected answer; try again.',
};

/** "Airtable said: <TYPE>. <sentence>", shown to the person and kept on a failed run. */
export const describeAirtableError = (error: AirtableError): string =>
  `${error.airtableType ? `Airtable said: ${error.airtableType}. ` : ''}${sentences[error.reason]}`;
