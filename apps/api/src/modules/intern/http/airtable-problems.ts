import { unprocessable, upstreamFailed } from '../../../shared/errors/app-error.ts';
import { AirtableError, type AirtableErrorReason } from '../application/airtable-source.ts';

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

/** The source is wrong (422); anything else is Airtable's side (502). */
const sourceProblems: ReadonlySet<AirtableErrorReason> = new Set([
  'unauthorized',
  'forbidden',
  'not_found',
  'view_not_found',
  'too_many_records',
]);

/** `AirtableError` → a problem the person can act on; anything else passes through. */
export const asProblem = (error: unknown): unknown => {
  if (!(error instanceof AirtableError)) return error;
  const said = error.airtableType ? `Airtable said: ${error.airtableType}. ` : '';
  const detail = `${said}${sentences[error.reason]}`;
  return sourceProblems.has(error.reason)
    ? unprocessable(detail, 'airtable_source_invalid')
    : upstreamFailed(detail, 'airtable_unavailable');
};
