import { ImportSourceRequest } from '@feedback-portal/contracts';
import { z } from 'zod';
import { validationFailed } from '../../../shared/errors/app-error.ts';
import { fieldIssues } from '../../../shared/errors/field-issues.ts';
import {
  AirtableError,
  type AirtableErrorReason,
  type AirtableRecord,
  type AirtableSource,
} from '../application/airtable-source.ts';

const Page = z.object({
  records: z.array(
    z.object({
      id: z.string().regex(/^rec[A-Za-z0-9]{14}$/),
      createdTime: z.iso.datetime(),
      fields: z.record(z.string(), z.unknown()),
    }),
  ),
  offset: z.string().min(1).optional(),
});

// Airtable's error body: `{ error: { type, message } }`, or `{ error: "NOT_FOUND" }` for some 404s.
const ErrorBody = z.object({
  error: z.union([
    z.object({ type: z.string(), message: z.string().optional() }),
    z.string().transform((type) => ({ type, message: undefined })),
  ]),
});

const reasonByStatus: Readonly<Record<number, AirtableErrorReason>> = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  429: 'rate_limited',
};

const messages: Readonly<Record<AirtableErrorReason, string>> = {
  unauthorized: "Airtable didn't accept this API key",
  forbidden: "This API key can't read the base",
  not_found: "Airtable couldn't find the base or table",
  view_not_found: "Airtable couldn't find the view",
  rate_limited: 'Airtable is busy; try again in 30 seconds',
  too_many_records: 'The view has more records than one import can take',
  timeout: "Airtable didn't answer in time",
  unexpected: 'Airtable gave an unexpected answer',
};

const failure = (
  reason: AirtableErrorReason,
  airtable?: Readonly<{ type?: string | null | undefined; message?: string | null | undefined }>,
) => new AirtableError(reason, messages[reason], airtable);

/** Turns a failed response into an `AirtableError`, keeping Airtable's type and message. */
const errorFrom = async (response: Response): Promise<AirtableError> => {
  const body = ErrorBody.safeParse(await response.json().catch(() => undefined));
  const airtable = body.success ? body.data.error : undefined;
  if (response.status === 422 && airtable?.type === 'VIEW_NAME_NOT_FOUND') {
    return failure('view_not_found', airtable);
  }
  return failure(reasonByStatus[response.status] ?? 'unexpected', airtable);
};

/** Where a malformed page went wrong, by path only: field values are personal data. */
const describeIssues = (error: z.ZodError, page: number): string =>
  error.issues
    .slice(0, 3)
    .map((issue) => `page ${page}: ${issue.path.join('.') || '(the page)'}`)
    .join('; ');

export type AirtableRestSourceOptions = Readonly<{
  apiBaseUrl: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  maxRecords?: number;
}>;

/**
 * Airtable's REST API: `GET /v0/{base}/{table}?view=…&pageSize=100`, following `offset` until the
 * last page. Each page is validated before it's used; nothing is retried (a 429 asks the user to
 * wait 30 seconds, as Airtable requires).
 */
export const createAirtableRestSource = ({
  apiBaseUrl,
  fetchFn = fetch,
  timeoutMs = 15_000,
  maxRecords = 2000,
}: AirtableRestSourceOptions): AirtableSource => ({
  fetchRecords: async (input) => {
    // The shared rules (8.3's form checks the same), so nothing malformed reaches Airtable.
    const parsed = ImportSourceRequest.safeParse(input);
    if (!parsed.success) throw validationFailed(fieldIssues(parsed.error));
    const { token, baseId, tableId, view } = parsed.data;

    const fetchPage = async (offset: string | undefined, page: number) => {
      const url = new URL(`${apiBaseUrl}/v0/${baseId}/${tableId}`);
      url.searchParams.set('pageSize', '100');
      url.searchParams.set('view', view);
      if (offset) url.searchParams.set('offset', offset);
      const response = await fetchFn(url, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutMs),
      }).catch((error: unknown) => {
        throw failure(
          error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unexpected',
        );
      });
      if (!response.ok) throw await errorFrom(response);
      const body = Page.safeParse(await response.json().catch(() => undefined));
      if (!body.success) {
        throw new AirtableError(
          'unexpected',
          `${messages.unexpected} (${describeIssues(body.error, page)})`,
        );
      }
      return body.data;
    };

    // Pages come one after another: each needs the previous page's offset.
    const readFrom = async (
      offset: string | undefined,
      page: number,
      records: readonly AirtableRecord[],
    ): Promise<readonly AirtableRecord[]> => {
      const next = await fetchPage(offset, page);
      const all = [...records, ...next.records];
      if (all.length > maxRecords) throw failure('too_many_records');
      return next.offset ? readFrom(next.offset, page + 1, all) : all;
    };

    return readFrom(undefined, 1, []);
  },
});
