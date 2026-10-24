import { maxPhotoBytes, type StatusAction } from '@feedback-portal/contracts';
import {
  conflict,
  forbidden,
  notFound,
  unavailable,
  validationFailed,
} from '../../../shared/errors/app-error.ts';
import type { Viewer } from '../../cohort/application/batch-scope.ts';
import type { BatchId } from '../../cohort/domain/batch-id.ts';
import {
  type ChangeInput,
  type DetailsInput,
  graduate,
  type Intern,
  liftNotice,
  isReadOnly,
  onboardIntern,
  setPhoto as withPhoto,
  terminate,
  withdraw,
} from '../domain/intern.ts';
import { type InternId, newInternId } from '../domain/intern-id.ts';
import { newStatusEventId } from '../domain/status-event-id.ts';
import type { InternAdminScope, InternAdminTransaction } from './intern-admin.ts';
import type { InternDetailView, InternSummaryView } from './intern-queries.ts';
import type { PhotoStorage, PhotoUploadTicketView, UploadedPhoto } from './photo-storage.ts';

export type ManageInternsDeps = Readonly<{
  transaction: InternAdminTransaction;
  /** `null` when photos are off (no Cloudinary configured). */
  photos: PhotoStorage | null;
  now: () => Date;
}>;

/** Who is acting. */
export type Actor = Viewer;

const ensureCanSee = async ({ batchAccess }: InternAdminScope, actor: Actor, batchId: BatchId) => {
  const access = await batchAccess(actor, batchId);
  if (!access) throw notFound('Batch not found');
  return access;
};

/**
 * A batch the actor can't see is a 404 (as if it didn't exist); one they can see but don't run
 * is a 403. Admins, and the batch's current PM, manage its interns while it isn't archived.
 */
const ensureCanManage = async (
  scope: InternAdminScope,
  actor: Actor,
  batchId: BatchId,
): Promise<void> => {
  const access = await ensureCanSee(scope, actor, batchId);
  if (!access.canManage) {
    throw forbidden("Only an admin or this batch's programme manager can manage its interns");
  }
  if (access.isArchived) throw conflict('This batch is archived', 'batch_archived');
};

/** Adds an intern by hand (when they aren't in Airtable): Active, with the onboarding event. */
export const addIntern = (
  { transaction, now }: ManageInternsDeps,
  { actor, batchId, details }: Readonly<{ actor: Actor; batchId: BatchId; details: DetailsInput }>,
): Promise<Intern> =>
  transaction(async (scope) => {
    await ensureCanManage(scope, actor, batchId);
    const intern = onboardIntern({
      id: newInternId(),
      eventId: newStatusEventId(),
      batchId,
      details,
      actor: actor.id,
      now: now(),
    });
    await scope.interns.save(intern);
    return intern;
  });

/** The roster: anyone who can see the batch, archived or not; otherwise a 404. */
export const listInterns = (
  { transaction }: ManageInternsDeps,
  { actor, batchId }: Readonly<{ actor: Actor; batchId: BatchId }>,
): Promise<readonly InternSummaryView[]> =>
  transaction(async (scope) => {
    await ensureCanSee(scope, actor, batchId);
    return scope.queries.listForBatch(batchId);
  });

/** One intern's profile, for anyone who can see the batch; an intern of another batch is a 404. */
export const getIntern = (
  { transaction }: ManageInternsDeps,
  { actor, batchId, internId }: Readonly<{ actor: Actor; batchId: BatchId; internId: string }>,
): Promise<InternDetailView> =>
  transaction(async (scope) => {
    await ensureCanSee(scope, actor, batchId);
    const intern = await scope.queries.detail(batchId, internId);
    if (!intern) throw notFound('Intern not found');
    return intern;
  });

const operations: Readonly<Record<StatusAction, (intern: Intern, change: ChangeInput) => Intern>> =
  {
    lift_notice: liftNotice,
    terminate,
    graduate,
    withdraw,
  };

/**
 * A status change by hand (PRODUCT §10): only the batch's current PM, never in an archived
 * batch. The intern's row is locked first, so a second change at the same time sees this one.
 */
export const changeStatus = (
  { transaction, now }: ManageInternsDeps,
  {
    actor,
    batchId,
    internId,
    action,
    reason,
  }: Readonly<{
    actor: Actor;
    batchId: BatchId;
    internId: InternId;
    action: StatusAction;
    reason: string;
  }>,
): Promise<InternDetailView> =>
  transaction(async (scope) => {
    const access = await ensureCanSee(scope, actor, batchId);
    if (!access.isProgramManager) {
      throw forbidden("Only this batch's programme manager can change an intern's status");
    }
    if (access.isArchived) throw conflict('This batch is archived', 'batch_archived');
    const intern = await scope.interns.findByIdForUpdate(internId);
    if (intern?.batchId !== batchId) throw notFound('Intern not found');
    await scope.interns.save(
      operations[action](intern, {
        eventId: newStatusEventId(),
        reason,
        actor: actor.id,
        now: now(),
      }),
    );
    const detail = await scope.queries.detail(batchId, internId);
    if (!detail) throw new Error(`intern ${internId} vanished inside its transaction`);
    return detail;
  });

const photosOrUnavailable = (photos: PhotoStorage | null): PhotoStorage => {
  if (!photos) throw unavailable('Photos are not configured');
  return photos;
};

type InternRef = Readonly<{ actor: Actor; batchId: BatchId; internId: InternId }>;

/**
 * Photos are for the batch's managers (admins and its PM, 7.7 decision 1), never in an archived
 * batch or for a read-only intern. Loads (and locks) the intern of that batch.
 */
const loadForPhoto = async (scope: InternAdminScope, { actor, batchId, internId }: InternRef) => {
  await ensureCanManage(scope, actor, batchId);
  const intern = await scope.interns.findByIdForUpdate(internId);
  if (intern?.batchId !== batchId) throw notFound('Intern not found');
  if (isReadOnly(intern)) {
    throw conflict("This intern's record is read-only", 'intern_read_only');
  }
  return intern;
};

/** A signed upload for a new photo of this intern. */
export const photoUploadTicket = (
  { transaction, photos, now }: ManageInternsDeps,
  ref: InternRef,
): Promise<PhotoUploadTicketView> => {
  const storage = photosOrUnavailable(photos);
  return transaction(async (scope) => {
    await loadForPhoto(scope, ref);
    return storage.ticketFor(ref.internId, now());
  });
};

export type SetPhotoResult = Readonly<{
  intern: InternDetailView;
  /** Whether deleting the replaced photo from the storage failed (it's kept, and logged). */
  previousRemovalFailed: boolean;
}>;

/**
 * Saves an uploaded photo once the storage's answer is proven genuine and for this intern, then
 * deletes the photo it replaces (best effort, after the change is committed).
 */
export const setInternPhoto = async (
  { transaction, photos, now }: ManageInternsDeps,
  { upload, bytes, ...ref }: InternRef & Readonly<{ upload: UploadedPhoto; bytes: number }>,
): Promise<SetPhotoResult> => {
  const storage = photosOrUnavailable(photos);
  const { intern, previous } = await transaction(async (scope) => {
    const current = await loadForPhoto(scope, ref);
    // The size is reported by the browser; the format is enforced by the signed upload.
    if (bytes > maxPhotoBytes) {
      throw validationFailed([{ path: 'bytes', message: 'Photo must be under 5 MB' }]);
    }
    if (!storage.isGenuineUpload(ref.internId, upload)) {
      throw validationFailed([{ path: 'publicId', message: "This upload couldn't be verified" }]);
    }
    await scope.interns.save(withPhoto(current, { publicId: upload.publicId, now: now() }));
    const detail = await scope.queries.detail(ref.batchId, ref.internId);
    if (!detail) throw new Error(`intern ${ref.internId} vanished inside its transaction`);
    return { intern: detail, previous: current.photoPublicId };
  });
  if (previous === null || previous === upload.publicId) {
    return { intern, previousRemovalFailed: false };
  }
  const previousRemovalFailed = await storage
    .remove(previous, now())
    .then(() => false)
    .catch(() => true);
  return { intern, previousRemovalFailed };
};
