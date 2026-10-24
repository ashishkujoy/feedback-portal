import type { InternSummary } from '@feedback-portal/contracts';
import type { InternSummaryView } from '../application/intern-queries.ts';
import type { Intern } from '../domain/intern.ts';

export const toInternSummary = (intern: Intern | InternSummaryView): InternSummary => ({
  id: intern.id,
  batchId: intern.batchId,
  username: intern.username,
  name: intern.name,
  email: intern.email,
  status: intern.status,
  colorCode: intern.colorCode,
  noticeEndsOn: intern.noticeEndsOn,
});
