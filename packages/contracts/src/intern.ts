import { z } from 'zod';
import { ColorCode } from './color-code.ts';
import { InternStatus } from './intern-status.ts';

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} must be at most ${max} characters` })
    .nullish()
    .transform((value) => (value ? value : null));

/**
 * `POST /batches/:batchId/interns`. The same limits as the API's domain, so the web form can
 * check them first. The username is stored lower-cased, without a leading "@".
 */
export const CreateInternRequest = z.object({
  username: z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, '').toLowerCase())
    .pipe(
      z
        .string()
        .min(1, { error: 'Username is required', abort: true })
        .max(50, { error: 'Username must be at most 50 characters' })
        .regex(/^[a-z0-9._-]+$/, {
          error: 'Username can only contain letters, digits, ".", "_" and "-"',
        }),
    ),
  name: z
    .string()
    .trim()
    .min(1, { error: 'Name is required' })
    .max(200, { error: 'Name must be at most 200 characters' }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(
      z
        .email({ error: 'Invalid email address' })
        .max(254, { error: 'Email must be at most 254 characters' }),
    ),
  phone: optionalText(50, 'Phone'),
  diplomaBranch: optionalText(200, 'Diploma branch'),
  parentNames: optionalText(500, 'Parent names'),
  interviewNotes: optionalText(20_000, 'Interview notes'),
});
export type CreateInternRequest = z.input<typeof CreateInternRequest>;

/** An intern as lists show them. `noticeEndsOn` is `YYYY-MM-DD`, set exactly while on notice. */
export const InternSummary = z.object({
  id: z.uuid(),
  batchId: z.uuid(),
  username: z.string(),
  name: z.string(),
  email: z.email(),
  status: InternStatus,
  colorCode: ColorCode.nullable(),
  noticeEndsOn: z.iso.date().nullable(),
});
export type InternSummary = z.infer<typeof InternSummary>;
