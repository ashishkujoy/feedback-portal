import { unprocessable, upstreamFailed } from '../../../shared/errors/app-error.ts';
import {
  AirtableError,
  type AirtableErrorReason,
  describeAirtableError,
} from '../application/airtable-source.ts';

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
  const detail = describeAirtableError(error);
  return sourceProblems.has(error.reason)
    ? unprocessable(detail, 'airtable_source_invalid')
    : upstreamFailed(detail, 'airtable_unavailable');
};
