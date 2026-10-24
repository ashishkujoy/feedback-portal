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
  refreshFromAirtable,
  setPhoto as withPhoto,
  terminate,
  updateDetails,
  withdraw,
} from '../domain/intern.ts';
import { InternId, newInternId } from '../domain/intern-id.ts';
import { newId } from '../../../shared/ids.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { newStatusEventId } from '../domain/status-event-id.ts';
import { type MappedRow, mapRecords } from './airtable-mapping.ts';
import {
  AirtableError,
  type AirtableSource,
  type AirtableSourceInput,
  describeAirtableError,
} from './airtable-source.ts';
import type { ImportError, ImportRuns } from './import-runs.ts';
import { type ImportPreviewView, previewImport } from './import-preview.ts';
import type { InternAdminScope, InternAdminTransaction } from './intern-admin.ts';
import type { InternDetailView, InternSummaryView } from './intern-queries.ts';
import type { PhotoStorage, PhotoUploadTicketView, UploadedPhoto } from './photo-storage.ts';

export type ManageInternsDeps = Readonly<{
  transaction: InternAdminTransaction;
  /** Reads an import's source (8.1); the token comes with each request and is never kept. */
  airtable: AirtableSource;
  /** Records runs outside any transaction, so a failed run is still recorded (8.4). */
  importRuns: ImportRuns;
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

/** Fixes an intern's details (A15); the username stays, since imports match on it. */
export const updateInternDetails = (
  { transaction, now }: ManageInternsDeps,
  {
    actor,
    batchId,
    internId,
    details,
  }: InternRef & Readonly<{ details: Omit<DetailsInput, 'username'> }>,
): Promise<InternDetailView> =>
  transaction(async (scope) => {
    await ensureCanManage(scope, actor, batchId);
    const intern = await scope.interns.findByIdForUpdate(internId);
    if (intern?.batchId !== batchId) throw notFound('Intern not found');
    const next = updateDetails(intern, {
      details: { ...details, username: intern.username },
      now: now(),
    });
    await scope.interns.save(next);
    const detail = await scope.queries.detail(batchId, internId);
    if (!detail) throw new Error(`intern ${internId} vanished inside its transaction`);
    return detail;
  });

/**
 * What importing this Airtable view would do (8.3), writing nothing. Access is checked first; the
 * view is read outside any database transaction, so none is held open during the network call.
 */
export const previewInternImport = async (
  { transaction, airtable }: ManageInternsDeps,
  {
    actor,
    batchId,
    source,
  }: Readonly<{ actor: Actor; batchId: BatchId; source: AirtableSourceInput }>,
): Promise<ImportPreviewView> => {
  const existing = await transaction(async (scope) => {
    await ensureCanManage(scope, actor, batchId);
    return scope.queries.usernamesForBatch(batchId);
  });
  const records = await airtable.fetchRecords(source);
  return previewImport(mapRecords(records), existing, records.length);
};

export type ImportResultView = Readonly<{
  importId: string;
  counts: Readonly<{ created: number; updated: number; skipped: number }>;
  invalid: readonly ImportError[];
}>;

/** The sentence a failed run keeps: Airtable's, the API's own, or a general one. */
const failureReasonOf = (error: unknown): string => {
  if (error instanceof AirtableError) return describeAirtableError(error);
  if (error instanceof AppError) return error.message;
  return "The import couldn't be saved.";
};

/** Runs `step` for each item, one after another (they share one transaction's connection). */
const inTurn = async <T>(items: readonly T[], step: (item: T) => Promise<void>): Promise<void> =>
  items.reduce<Promise<void>>(
    (previous, item) => previous.then(() => step(item)),
    Promise.resolve(),
  );

/**
 * Imports an Airtable view into the batch (8.4): reads it again (decision 1), then, all or
 * nothing under the batch's import lock (decisions 2 and 4), adds the new interns and refreshes
 * the matched ones. Invalid rows are skipped. The run is recorded as pending first, then
 * completed or failed; a failed run changes no intern.
 */
export const importInterns = async (
  { transaction, airtable, importRuns, now }: ManageInternsDeps,
  {
    actor,
    batchId,
    source,
  }: Readonly<{ actor: Actor; batchId: BatchId; source: AirtableSourceInput }>,
): Promise<ImportResultView> => {
  await transaction((scope) => ensureCanManage(scope, actor, batchId));
  const importId = newId();
  await importRuns.start({
    id: importId,
    batchId,
    baseId: source.baseId,
    tableId: source.tableId,
    view: source.view,
    importedBy: actor.id,
    createdAt: now(),
  });
  try {
    const records = await airtable.fetchRecords(source);
    const mapped = mapRecords(records);
    const rowsByNumber = new Map(mapped.valid.map((row) => [row.row, row]));
    const mappedRow = (row: number): MappedRow => {
      const found = rowsByNumber.get(row);
      if (!found) throw new Error(`row ${row} vanished between mapping and comparing`);
      return found;
    };
    return await transaction(async (scope) => {
      await scope.lockImports(batchId);
      // Again inside the lock: the batch may have been archived, or its PM changed, meanwhile.
      await ensureCanManage(scope, actor, batchId);
      const plan = previewImport(
        mapped,
        await scope.queries.usernamesForBatch(batchId),
        records.length,
      );
      const at = now();
      await inTurn(plan.new, async ({ row }) => {
        const { recordId, details, airtableFields } = mappedRow(row);
        await scope.interns.save(
          onboardIntern({
            id: newInternId(),
            eventId: newStatusEventId(),
            batchId,
            details,
            airtableRecordId: recordId,
            airtableFields,
            actor: actor.id,
            now: at,
          }),
        );
      });
      await inTurn(plan.updated, async ({ row, internId }) => {
        const { recordId, details, airtableFields } = mappedRow(row);
        const intern = await scope.interns.findByIdForUpdate(InternId.parse(internId));
        if (!intern) throw new Error(`intern ${internId} vanished inside the import`);
        await scope.interns.save(
          refreshFromAirtable(intern, {
            details,
            airtableRecordId: recordId,
            airtableFields,
            now: at,
          }),
        );
      });
      await scope.importRuns.complete(importId, {
        recordCount: records.length,
        createdCount: plan.new.length,
        updatedCount: plan.updated.length,
        skippedCount: plan.invalid.length,
        errors: plan.invalid,
        completedAt: now(),
      });
      return {
        importId,
        counts: {
          created: plan.new.length,
          updated: plan.updated.length,
          skipped: plan.invalid.length,
        },
        invalid: plan.invalid,
      };
    });
  } catch (error) {
    await importRuns.fail(importId, { reason: failureReasonOf(error), completedAt: now() });
    throw error;
  }
};
