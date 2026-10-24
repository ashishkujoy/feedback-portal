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
  /** A 128px face-centred square; `null` without a photo (initials are shown instead). */
  photoUrl: z.url().nullable(),
});
export type InternSummary = z.infer<typeof InternSummary>;

const Actor = z.object({ id: z.uuid(), name: z.string() });

/** One status change; `fromStatus` and `reason` are `null` only for the onboarding event. */
export const InternStatusEvent = z.object({
  id: z.uuid(),
  fromStatus: InternStatus.nullable(),
  toStatus: InternStatus,
  reason: z.string().nullable(),
  noticeStartsOn: z.iso.date().nullable(),
  noticeEndsOn: z.iso.date().nullable(),
  actor: Actor,
  createdAt: z.iso.datetime(),
});
export type InternStatusEvent = z.infer<typeof InternStatusEvent>;

/** `GET /batches/:batchId/interns/:internId`: the profile. Events are newest first. */
export const InternDetail = InternSummary.extend({
  phone: z.string().nullable(),
  diplomaBranch: z.string().nullable(),
  parentNames: z.string().nullable(),
  /** Markdown, rendered sanitized. */
  interviewNotes: z.string().nullable(),
  /** Added by hand (7.3), or imported from Airtable (Phase 8). */
  source: z.enum(['manual', 'airtable']),
  createdAt: z.iso.datetime(),
  /** Who added or first imported the intern: the onboarding event's actor. */
  addedBy: Actor,
  statusEvents: z.array(InternStatusEvent),
});
export type InternDetail = z.infer<typeof InternDetail>;

/** The changes a programme manager makes by hand (7.6); notice is given through feedback (Phase 9). */
export const statusActions = ['lift_notice', 'terminate', 'graduate', 'withdraw'] as const;
export const StatusAction = z.enum(statusActions);
export type StatusAction = z.infer<typeof StatusAction>;

/** `POST /batches/:batchId/interns/:internId/status-changes`. The domain's reason limits. */
export const ChangeStatusRequest = z.object({
  action: StatusAction,
  reason: z
    .string()
    .trim()
    .min(1, { error: 'Add a reason.' })
    .max(20_000, { error: 'Reason must be at most 20000 characters' }),
});
export type ChangeStatusRequest = z.input<typeof ChangeStatusRequest>;

/** Photos are JPG or PNG up to 5 MB (A6-photo). */
export const photoFormats = ['jpg', 'png'] as const;
export const maxPhotoBytes = 5 * 1024 * 1024;

/** `POST …/photo-upload`: everything the browser needs for one signed upload to Cloudinary. */
export const PhotoUploadTicket = z.object({
  uploadUrl: z.url(),
  apiKey: z.string(),
  timestamp: z.int(),
  signature: z.string(),
  publicId: z.string(),
  allowedFormats: z.string(),
});
export type PhotoUploadTicket = z.infer<typeof PhotoUploadTicket>;

/** `PUT …/photo`: Cloudinary's answer to the upload, which the API checks before saving it. */
export const SetPhotoRequest = z.object({
  publicId: z.string().min(1),
  version: z.int().positive(),
  signature: z.string().min(1),
  bytes: z.int().nonnegative(),
});
export type SetPhotoRequest = z.infer<typeof SetPhotoRequest>;
