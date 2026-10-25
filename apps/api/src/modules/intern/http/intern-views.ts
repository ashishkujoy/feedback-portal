import type { InternDetail, InternSummary } from '@feedback-portal/contracts';
import type { InternDetailView, InternSummaryView } from '../application/intern-queries.ts';
import type { Intern } from '../domain/intern.ts';

/** Turns a stored photo id into its URL; `null` when there's no photo (or photos are off). */
export type PhotoUrl = (publicId: string | null) => string | null;

export const toInternSummary = (
  intern: Intern | InternSummaryView,
  photoUrl: PhotoUrl,
): InternSummary => ({
  id: intern.id,
  batchId: intern.batchId,
  username: intern.username,
  name: intern.name,
  email: intern.email,
  status: intern.status,
  colorCode: intern.colorCode,
  noticeEndsOn: intern.noticeEndsOn,
  photoUrl: photoUrl(intern.photoPublicId),
});

export const toInternDetail = (intern: InternDetailView, photoUrl: PhotoUrl): InternDetail => ({
  ...toInternSummary(intern, photoUrl),
  phone: intern.phone,
  diplomaBranch: intern.diplomaBranch,
  parentNames: intern.parentNames,
  interviewNotes: intern.interviewNotes,
  source: intern.source,
  createdAt: intern.createdAt.toISOString(),
  addedBy: intern.addedBy,
  statusEvents: intern.statusEvents.map((event) => ({
    id: event.id,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    reason: event.reason,
    noticeStartsOn: event.noticeStartsOn,
    noticeEndsOn: event.noticeEndsOn,
    feedbackId: event.feedbackId,
    actor: event.actor,
    createdAt: event.createdAt.toISOString(),
  })),
});
